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
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      Object.values(connections).forEach(peer => peer.close());
    };
  }, []);

  const getPermissions = async () => {
    try {
      const constraints = {
        video: true,
        audio: { 
          echoCancellation: true, 
          noiseSuppression: true 
        }
      };
      const userMediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      window.localStream = userMediaStream;
      if (localVideoref.current) {
        localVideoref.current.srcObject = userMediaStream;
      }
      setVideoAvailable(true);
      setAudioAvailable(true);
      setScreenAvailable(!!navigator.mediaDevices.getDisplayMedia);
      connectToSocketServer();
    } catch (error) {
      console.log("Permission Error: ", error);
    }
  };

  const connectToSocketServer = () => {
    socketRef.current = io.connect(server_url, { secure: false });
    socketRef.current.on("connect", () => {
      socketRef.current.emit("join-call", window.location.href);
      socketIdRef.current = socketRef.current.id;

      // Handle other events...
      // See original connectToSocketServer for the rest
    });
  };

  const gotMessageFromServer = (fromId, message) => {
    const signal = JSON.parse(message);
    // Handle incoming signals...
    // See original gotMessageFromServer for the logic
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
                    onChange={(e) => setMessage(e.target.value)} 
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
