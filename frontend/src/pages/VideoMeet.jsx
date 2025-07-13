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

var connections = {};

export default function VideoMeetComponent() {
  const socketRef = useRef();
  const socketIdRef = useRef();
  const localVideoref = useRef();
  const videoRef = useRef([]);
  const peerRefs = useRef({});

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
    console.log("Video permission init");
    getPermissions();
    return () => {
      // Cleanup on unmount
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      Object.values(connections).forEach(peer => {
        peer.close();
      });
    };
  }, []);

  const getPermissions = async () => {
    try {
      const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
      setVideoAvailable(true);
      console.log("Video permission granted");

      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setAudioAvailable(true);
      console.log("Audio permission granted");

      setScreenAvailable(!!navigator.mediaDevices.getDisplayMedia);

      const userMediaStream = await navigator.mediaDevices.getUserMedia({
        video: videoAvailable,
        audio: audioAvailable,
      });

      window.localStream = userMediaStream;
      if (localVideoref.current) {
        localVideoref.current.srcObject = userMediaStream;
      }
    } catch (error) {
      console.log("Permission Error: ", error);
    }
  };

  useEffect(() => {
    if (video && audio) {
      getUserMedia();
    }
  }, [video, audio]);

  const getUserMedia = () => {
    navigator.mediaDevices
      .getUserMedia({ video, audio })
      .then(getUserMediaSuccess)
      .catch((e) => console.log("getUserMedia error", e));
  };

  const getUserMediaSuccess = (stream) => {
    // Stop existing stream tracks
    if (window.localStream) {
      window.localStream.getTracks().forEach((track) => track.stop());
    }

    window.localStream = stream;
    localVideoref.current.srcObject = stream;

    Object.keys(connections).forEach(id => {
      if (id === socketIdRef.current) return;

      stream.getTracks().forEach((track) => {
        connections[id].addTrack(track, stream);
      });

      connections[id].createOffer().then((desc) => {
        connections[id].setLocalDescription(desc).then(() => {
          socketRef.current.emit("signal", id, JSON.stringify({ sdp: desc }));
        });
      });
    });
  };

  const connectToSocketServer = () => {
    socketRef.current = io.connect(server_url, { secure: false });

    socketRef.current.on("connect", () => {
      socketRef.current.emit("join-call", window.location.href);
      socketIdRef.current = socketRef.current.id;

      socketRef.current.on("user-left", (id) => {
        console.log("User left:", id);
        if (connections[id]) {
          connections[id].close();
          delete connections[id];
        }
        setVideos((prevVideos) => prevVideos.filter((video) => video.socketId !== id));
      });

      socketRef.current.on("signal", gotMessageFromServer);

      socketRef.current.on("user-joined", (id, clients) => {
        console.log("New user joined:", id);

        clients.forEach((clientId) => {
          if (clientId === socketIdRef.current || connections[clientId]) return;

          connections[clientId] = new RTCPeerConnection(peerConfigConnections);
          peerRefs.current[clientId] = connections[clientId];

          connections[clientId].onicecandidate = (event) => {
            if (event.candidate) {
              socketRef.current.emit("signal", clientId, JSON.stringify({ ice: event.candidate }));
            }
          };

          connections[clientId].ontrack = (event) => {
            const [stream] = event.streams;
            setVideos((prev) => [...prev, { socketId: clientId, stream }]);
          };

          if (window.localStream) {
            window.localStream.getTracks().forEach((track) => {
              connections[clientId].addTrack(track, window.localStream);
            });
          }

          if (id === socketIdRef.current) {
            connections[clientId].createOffer()
              .then(offer => connections[clientId].setLocalDescription(offer))
              .then(() => {
                socketRef.current.emit("signal", clientId, JSON.stringify({ 
                  sdp: connections[clientId].localDescription 
                }));
              })
              .catch(err => console.error("Offer error:", err));
          }
        });
      });

      socketRef.current.on("chat-message", addMessage);
    });
  };

  const gotMessageFromServer = (fromId, message) => {
    const signal = JSON.parse(message);

    if (!connections[fromId]) {
      connections[fromId] = new RTCPeerConnection(peerConfigConnections);
      
      connections[fromId].onicecandidate = (event) => {
        if (event.candidate) {
          socketRef.current.emit("signal", fromId, JSON.stringify({ ice: event.candidate }));
        }
      };

      connections[fromId].ontrack = (event) => {
        const [stream] = event.streams;
        setVideos((prev) => [...prev, { socketId: fromId, stream }]);
      };

      if (window.localStream) {
        window.localStream.getTracks().forEach((track) => {
          connections[fromId].addTrack(track, window.localStream);
        });
      }
    }

    if (signal.sdp) {
      const desc = new RTCSessionDescription(signal.sdp);
      connections[fromId].setRemoteDescription(desc)
        .then(() => {
          if (signal.sdp.type === "offer") {
            return connections[fromId].createAnswer()
              .then(answer => connections[fromId].setLocalDescription(answer))
              .then(() => {
                socketRef.current.emit("signal", fromId, JSON.stringify({ 
                  sdp: connections[fromId].localDescription 
                }));
              });
          }
        })
        .catch(err => console.error("Error setting remote description:", err));
    }

    if (signal.ice) {
      connections[fromId].addIceCandidate(new RTCIceCandidate(signal.ice))
        .catch(err => console.error("Error adding ICE candidate:", err));
    }
  };

  const connect = () => {
    setAskForUsername(false);
    setTimeout(() => {
      connectToSocketServer();
    }, 200);
  };

  const addMessage = (data, sender, socketIdSender) => {
    setMessages((prev) => [...prev, { sender, data }]);
    if (socketIdSender !== socketIdRef.current) {
      setNewMessages((prev) => prev + 1);
    }
  };

  const sendMessage = () => {
    socketRef.current.emit("chat-message", message, username);
    setMessage("");
  };

  const handleVideo = () => {
    setVideo((prev) => !prev);
    if (window.localStream) {
      const videoTracks = window.localStream.getVideoTracks();
      if (videoTracks.length > 0) {
        videoTracks[0].enabled = !videoTracks[0].enabled;
      }
    }
  };

  const handleAudio = () => {
    setAudio((prev) => !prev);
    if (window.localStream) {
      const audioTracks = window.localStream.getAudioTracks();
      if (audioTracks.length > 0) {
        audioTracks[0].enabled = !audioTracks[0].enabled;
      }
    }
  };

  const handleScreen = () => setScreen((prev) => !prev);
  const handleMessage = (e) => setMessage(e.target.value);

  const handleEndCall = () => {
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
          <Button variant="contained" onClick={connect}>
            Connect
          </Button>
          <div>
            <video ref={localVideoref} autoPlay muted></video>
          </div>
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
                        <p style={{ fontWeight: "bold" }}>{msg.sender}</p>
                        <p>{msg.data}</p>
                      </div>
                    ))
                  )}
                </div>
                <div className={styles.chattingArea}>
                  <TextField 
                    value={message} 
                    onChange={handleMessage} 
                    label="Enter Your chat" 
                  />
                  <Button onClick={sendMessage}>Send</Button>
                </div>
              </div>
            </div>
          )}

          <div className={styles.buttonContainers}>
            <IconButton onClick={handleVideo} style={{ color: "white" }}>
              {video ? <VideocamIcon /> : <VideocamOffIcon />}
            </IconButton>
            <IconButton onClick={handleEndCall} style={{ color: "red" }}>
              <CallEndIcon />
            </IconButton>
            <IconButton onClick={handleAudio} style={{ color: "white" }}>
              {audio ? <MicIcon /> : <MicOffIcon />}
            </IconButton>
            {screenAvailable && (
              <IconButton onClick={handleScreen} style={{ color: "white" }}>
                {screen ? <StopScreenShareIcon /> : <ScreenShareIcon />}
              </IconButton>
            )}
            <Badge badgeContent={newMessages} max={99} color="secondary">
              <IconButton onClick={() => setModal(!showModal)} style={{ color: "white" }}>
                <ChatIcon />
              </IconButton>
            </Badge>
          </div>

          <video className={styles.meetUserVideo} ref={localVideoref} autoPlay muted></video>

          <div className={styles.conferenceView}>
            {videos.map((video) => (
              <video
                key={video.socketId}
                ref={(el) => {
                  if (el && video.stream) {
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
