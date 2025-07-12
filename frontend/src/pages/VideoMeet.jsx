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
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

var connections = {};

export default function VideoMeetComponent() {
  const socketRef = useRef();
  const socketIdRef = useRef();
  const localVideoref = useRef();
  const videoRef = useRef([]);

  const [videoAvailable, setVideoAvailable] = useState(true);
  const [audioAvailable, setAudioAvailable] = useState(true);
  const [video, setVideo] = useState([]);
  const [audio, setAudio] = useState();
  const [screen, setScreen] = useState();
  const [showModal, setModal] = useState(true);
  const [screenAvailable, setScreenAvailable] = useState();
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState("");
  const [newMessages, setNewMessages] = useState(3);
  const [askForUsername, setAskForUsername] = useState(true);
  const [username, setUsername] = useState("");
  const [videos, setVideos] = useState([]);

  useEffect(() => {
    console.log("Video permission init");
    getPermissions();
  }, []);

  const getPermissions = async () => {
    try {
      const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
      setVideoAvailable(true);
      console.log("Video permission true");

      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setAudioAvailable(true);
      console.log("Audio permission true");

      if (navigator.mediaDevices.getDisplayMedia) {
        setScreenAvailable(true);
      } else {
        setScreenAvailable(false);
      }

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
    if (video !== undefined && audio !== undefined) {
      getUserMedia();
    }
  }, [video, audio]);

  const getUserMedia = () => {
    navigator.mediaDevices
      .getUserMedia({ video: video, audio: audio })
      .then(getUserMediaSuccess)
      .catch((e) => console.log("getUserMedia error", e));
  };

  const getUserMediaSuccess = (stream) => {
    if (window.localStream) {
      window.localStream.getTracks().forEach((track) => track.stop());
    }

    window.localStream = stream;
    localVideoref.current.srcObject = stream;

    for (let id in connections) {
      if (id === socketIdRef.current) continue;

      stream.getTracks().forEach((track) => {
        try {
          connections[id].addTrack(track, stream);
        } catch (err) {
          console.warn("Track already exists", err);
        }
      });

      connections[id].createOffer().then((desc) => {
        connections[id].setLocalDescription(desc).then(() => {
          socketRef.current.emit("signal", id, JSON.stringify({ sdp: desc }));
        });
      });
    }
  };

  const connectToSocketServer = () => {
    socketRef.current = io.connect(server_url, { secure: false });

    socketRef.current.on("connect", () => {
      socketRef.current.emit("join-call", window.location.href);
      socketIdRef.current = socketRef.current.id;

      socketRef.current.on("user-left", (id) => {
        setVideos((videos) => videos.filter((video) => video.socketId !== id));
      });

      socketRef.current.on("signal", gotMessageFromServer);

      socketRef.current.on("user-joined", (id, clients) => {
        clients.forEach((clientId) => {
          if (clientId === socketIdRef.current) return;

          connections[clientId] = new RTCPeerConnection(peerConfigConnections);

          connections[clientId].onicecandidate = (event) => {
            if (event.candidate) {
              socketRef.current.emit("signal", clientId, JSON.stringify({ ice: event.candidate }));
            }
          };

          connections[clientId].ontrack = (event) => {
            console.log("📷 Received track from:", clientId);
            const [stream] = event.streams;

            setVideos((prev) => {
              const exists = prev.find((v) => v.socketId === clientId);
              const updated = exists
                ? prev.map((v) => (v.socketId === clientId ? { ...v, stream } : v))
                : [...prev, { socketId: clientId, stream }];
              videoRef.current = updated;
              return updated;
            });
          };

          if (window.localStream) {
            window.localStream.getTracks().forEach((track) => {
              connections[clientId].addTrack(track, window.localStream);
            });
          }
        });

        if (id === socketIdRef.current) {
          for (let id2 in connections) {
            if (id2 === socketIdRef.current) continue;

            window.localStream.getTracks().forEach((track) => {
              try {
                connections[id2].addTrack(track, window.localStream);
              } catch (e) {}
            });

            connections[id2].createOffer().then((desc) => {
              connections[id2].setLocalDescription(desc).then(() => {
                socketRef.current.emit("signal", id2, JSON.stringify({ sdp: desc }));
              });
            });
          }
        }
      });

      socketRef.current.on("chat-message", addMessage);
    });
  };

  const gotMessageFromServer = (fromId, message) => {
    const signal = JSON.parse(message);

    if (fromId !== socketIdRef.current) {
      if (signal.sdp) {
        connections[fromId].setRemoteDescription(new RTCSessionDescription(signal.sdp)).then(() => {
          if (signal.sdp.type === "offer") {
            connections[fromId].createAnswer().then((desc) => {
              connections[fromId].setLocalDescription(desc).then(() => {
                socketRef.current.emit("signal", fromId, JSON.stringify({ sdp: desc }));
              });
            });
          }
        });
      }

      if (signal.ice) {
        connections[fromId].addIceCandidate(new RTCIceCandidate(signal.ice));
      }
    }
  };

  const connect = () => {
    setAskForUsername(false);
    setVideo(videoAvailable);
    setAudio(audioAvailable);
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

  const silence = () => {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const dst = osc.connect(ctx.createMediaStreamDestination());
    osc.start();
    ctx.resume();
    return Object.assign(dst.stream.getAudioTracks()[0], { enabled: false });
  };

  const black = ({ width = 640, height = 480 } = {}) => {
    const canvas = Object.assign(document.createElement("canvas"), { width, height });
    canvas.getContext("2d").fillRect(0, 0, width, height);
    const stream = canvas.captureStream();
    return Object.assign(stream.getVideoTracks()[0], { enabled: false });
  };

  const handleVideo = () => setVideo(!video);
  const handleAudio = () => setAudio(!audio);
  const handleScreen = () => setScreen(!screen);
  const handleMessage = (e) => setMessage(e.target.value);
  const handleEndCall = () => {
    try {
      let tracks = localVideoref.current.srcObject.getTracks();
      tracks.forEach((t) => t.stop());
    } catch (e) {}
    window.location.href = "/";
  };

  return (
    <div>
      {askForUsername ? (
        <div>
          <h2>Enter into Lobby</h2>
          <TextField label="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
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
                  <TextField value={message} onChange={handleMessage} label="Enter Your chat" />
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
                ref={(ref) => {
                  if (ref && video.stream) {
                    ref.srcObject = video.stream;
                    console.log("✅ Attached stream to:", video.socketId);
                  }
                }}
                autoPlay
                playsInline
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
