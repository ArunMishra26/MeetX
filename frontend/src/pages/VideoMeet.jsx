import React, { useEffect, useRef, useState } from "react";
import io from "socket.io-client";
import { Badge, IconButton, TextField, Button } from "@mui/material";
import VideocamIcon from "@mui/icons-material/Videocam";
import VideocamOffIcon from "@mui/icons-material/VideocamOff";
import CallEndIcon from "@mui/icons-material/CallEnd";
import MicIcon from "@mui/icons-material/Mic";
import MicOffIcon from "@mui/icons-material/MicOff";
import ScreenShareIcon from "@mui/icons-material/ScreenShare";
import StopScreenShareIcon from "@mui/icons-material/StopScreenShare";
import ChatIcon from "@mui/icons-material/Chat";
import styles from "../styles/videoComponent.module.css";
import server from "../environment.js";

const server_url = server;
const peerConfigConnections = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
  ],
};

let connections = {};

export default function VideoMeetComponent() {
  const socketRef = useRef();
  const socketIdRef = useRef();
  const localVideoref = useRef();
  const videoRefs = useRef({});
  
  const [videoAvailable, setVideoAvailable] = useState(true);
  const [audioAvailable, setAudioAvailable] = useState(true);
  const [video, setVideo] = useState(true);
  const [audio, setAudio] = useState(true);
  const [screen, setScreen] = useState(false);
  const [showModal, setModal] = useState(true);
  const [screenAvailable, setScreenAvailable] = useState(false);
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState("");
  const [newMessages, setNewMessages] = useState(0);
  const [askForUsername, setAskForUsername] = useState(true);
  const [username, setUsername] = useState("");
  const [videos, setVideos] = useState([]);

  useEffect(() => {
    getPermissions();
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      Object.values(connections).forEach(peer => peer.close());
    };
  }, []);

  const getPermissions = async () => {
    try {
      const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
      setVideoAvailable(true);
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setAudioAvailable(true);
      
      setScreenAvailable(!!navigator.mediaDevices.getDisplayMedia);

      const userMediaStream = new MediaStream();
      videoStream.getTracks().forEach(track => userMediaStream.addTrack(track));
      audioStream.getTracks().forEach(track => userMediaStream.addTrack(track));
      window.localStream = userMediaStream;

      if (localVideoref.current) {
        localVideoref.current.srcObject = userMediaStream;
      }
      
    } catch (error) {
      console.log("Permission Error: ", error);
    }
  };

  useEffect(() => {
    if (videoAvailable && audioAvailable) {
      connectToSocketServer();
    }
  }, [videoAvailable, audioAvailable]);

  const connectToSocketServer = () => {
    socketRef.current = io.connect(server_url);

    socketRef.current.on("connect", () => {
      socketIdRef.current = socketRef.current.id;
      socketRef.current.emit("join-call", window.location.href);

      // Handle user joining
      socketRef.current.on("user-joined", (id, clients) => {
        clients.forEach(clientId => {
          if (clientId !== socketIdRef.current) {
            createConnection(clientId);
          }
        });
      });

      socketRef.current.on("user-left", id => {
        if (connections[id]) {
          connections[id].close();
          delete connections[id];
          setVideos(videos => videos.filter(video => video.socketId !== id));
        }
      });

      socketRef.current.on("signal", gotMessageFromServer);
      socketRef.current.on("chat-message", addMessage);
    });
  };

  const createConnection = (clientId) => {
    const peerConnection = new RTCPeerConnection(peerConfigConnections);
    connections[clientId] = peerConnection;

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current.emit("signal", clientId, JSON.stringify({ ice: event.candidate }));
      }
    };

    peerConnection.ontrack = (event) => {
      const [stream] = event.streams;
      setVideos(videos => [...videos, { socketId: clientId, stream }]);

      const videoElement = document.createElement('video');
      videoElement.srcObject = stream;
      videoElement.autoplay = true;
      videoRefs.current[clientId] = videoElement;
    };

    // Add local tracks to the peer connection
    window.localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, window.localStream);
    });

    // Create offer if we're the initiator
    if (clientId === socketIdRef.current) {
      peerConnection.createOffer()
        .then(offer => peerConnection.setLocalDescription(offer))
        .then(() => {
          socketRef.current.emit("signal", clientId, JSON.stringify({ sdp: peerConnection.localDescription }));
        });
    }
  };

  const gotMessageFromServer = (fromId, message) => {
    const signal = JSON.parse(message);

    if (!connections[fromId]) {
      createConnection(fromId);
    }

    if (signal.sdp) {
      const desc = new RTCSessionDescription(signal.sdp);
      connections[fromId].setRemoteDescription(desc).then(() => {
        if (signal.sdp.type === "offer") {
          connections[fromId].createAnswer()
            .then(answer => connections[fromId].setLocalDescription(answer))
            .then(() => {
              socketRef.current.emit("signal", fromId, JSON.stringify({ sdp: connections[fromId].localDescription }));
            });
        }
      });
    }

    if (signal.ice) {
      connections[fromId].addIceCandidate(new RTCIceCandidate(signal.ice));
    }
  };

  const addMessage = (data, sender) => {
    setMessages(prev => [...prev, { sender, data }]);
    setNewMessages(prev => prev + 1);
  };

  const sendMessage = () => {
    socketRef.current.emit("chat-message", message, username);
    setMessage("");
  };

  const handleEndCall = () => {
    if (localVideoref.current.srcObject) {
      localVideoref.current.srcObject.getTracks().forEach(track => track.stop());
    }
    Object.values(connections).forEach(peer => peer.close());
    socketRef.current?.disconnect();
    window.location.href = "/";
  };

  return (
    <div>
      {askForUsername ? (
        <div>
          <h2>Enter into Lobby</h2>
          <TextField 
            label="Username" 
            value={username} 
            onChange={(e) => setUsername(e.target.value)} 
          />
          <Button variant="contained" onClick={() => setAskForUsername(false)}>
            Connect
          </Button>
          <video ref={localVideoref} autoPlay muted></video>
        </div>
      ) : (
        <div className={styles.meetVideoContainer}>
          {showModal && (
            <div className={styles.chatRoom}>
              <div className={styles.chatContainer}>
                <h1>Chat</h1>
                <div className={styles.chattingDisplay}>
                  {messages.length === 0 ? (
                    <p>No Messages Yet</p>
                  ) : (
                    messages.map((msg, idx) => (
                      <div key={idx}>
                        <p style={{fontWeight: 'bold'}}>{msg.sender}</p>
                        <p>{msg.data}</p>
                      </div>
                    ))
                  )}
                </div>
                <div className={styles.chattingArea}>
                  <TextField 
                    value={message} 
                    onChange={(e) => setMessage(e.target.value)} 
                    label="Enter Your chat" 
                  />
                  <Button onClick={sendMessage}>Send</Button>
                </div>
              </div>
            </div>
          )}

          <div className={styles.buttonContainers}>
            <IconButton onClick={() => setVideo(!video)} style={{ color: "white" }}>
              {video ? <VideocamIcon /> : <VideocamOffIcon />}
            </IconButton>
            <IconButton onClick={handleEndCall} style={{ color: "red" }}>
              <CallEndIcon />
            </IconButton>
            <IconButton onClick={() => setAudio(!audio)} style={{ color: "white" }}>
              {audio ? <MicIcon /> : <MicOffIcon />}
            </IconButton>
            {screenAvailable && (
              <IconButton onClick={() => setScreen(!screen)} style={{ color: "white" }}>
                {screen ? <StopScreenShareIcon /> : <ScreenShareIcon />}
              </IconButton>
            )}
            <Badge badgeContent={newMessages} max={99} color="secondary">
              <IconButton onClick={() => setModal(!showModal)} style={{ color: "white" }}>
                <ChatIcon />
              </IconButton>
            </Badge>
          </div>

          <video ref={localVideoref} autoPlay muted></video>

          <div className={styles.conferenceView}>
            {videos.map(video => (
              <video
                key={video.socketId}
                ref={el => {
                  if (el) {
                    el.srcObject = video.stream;
                  }
                }}
                autoPlay
                playsInline
                className={styles.remoteVideo}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
