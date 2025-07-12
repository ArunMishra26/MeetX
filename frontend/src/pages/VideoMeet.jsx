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

export default function VideoMeetComponent() {
  const socketRef = useRef();
  const socketIdRef = useRef();
  const localVideoRef = useRef();
  const screenShareRef = useRef();
  const connections = useRef({});
  const screenStream = useRef(null);

  const [videoAvailable, setVideoAvailable] = useState(true);
  const [audioAvailable, setAudioAvailable] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [showModal, setModal] = useState(true);
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState("");
  const [newMessages, setNewMessages] = useState(0);
  const [askForUsername, setAskForUsername] = useState(true);
  const [username, setUsername] = useState("");
  const [remoteStreams, setRemoteStreams] = useState([]);

  // Initialize media and permissions
  useEffect(() => {
    const initMedia = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: videoAvailable,
          audio: audioAvailable,
        });
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
        window.localStream = stream;
      } catch (error) {
        console.error("Error getting user media:", error);
      }
    };

    initMedia();
    return () => {
      if (window.localStream) {
        window.localStream.getTracks().forEach(track => track.stop());
      }
      if (screenStream.current) {
        screenStream.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [videoAvailable, audioAvailable]);

  // Handle screen sharing
  const handleScreenShare = async () => {
    try {
      if (!isScreenSharing) {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true
        });
        
        screenStream.current = stream;
        
        // Replace video tracks in all connections
        Object.keys(connections.current).forEach(id => {
          if (id === socketIdRef.current) return;
          
          const sender = connections.current[id].getSenders().find(s => s.track.kind === 'video');
          if (sender) {
            sender.replaceTrack(stream.getVideoTracks()[0]);
          }
        });

        // Handle when user stops sharing via browser controls
        stream.getVideoTracks()[0].onended = () => {
          stopScreenShare();
        };

        setIsScreenSharing(true);
        
        // Switch local video display to screen share
        if (screenShareRef.current) {
          screenShareRef.current.srcObject = stream;
        }
      } else {
        stopScreenShare();
      }
    } catch (error) {
      console.error("Error sharing screen:", error);
      stopScreenShare();
    }
  };

  const stopScreenShare = () => {
    if (screenStream.current) {
      screenStream.current.getTracks().forEach(track => track.stop());
      screenStream.current = null;
    }
    
    // Restore camera tracks
    if (window.localStream) {
      Object.keys(connections.current).forEach(id => {
        if (id === socketIdRef.current) return;
        
        const sender = connections.current[id].getSenders().find(s => s.track.kind === 'video');
        if (sender && window.localStream.getVideoTracks().length > 0) {
          sender.replaceTrack(window.localStream.getVideoTracks()[0]);
        }
      });
    }

    setIsScreenSharing(false);
    
    // Restore local video display
    if (screenShareRef.current) {
      screenShareRef.current.srcObject = null;
    }
  };

  // Socket connection and WebRTC setup
  const connectToSocketServer = () => {
    socketRef.current = io.connect(server_url, { secure: false });

    socketRef.current.on("connect", () => {
      socketRef.current.emit("join-call", window.location.href);
      socketIdRef.current = socketRef.current.id;

      socketRef.current.on("user-left", (id) => {
        if (connections.current[id]) {
          connections.current[id].close();
          delete connections.current[id];
        }
        setRemoteStreams(prev => prev.filter(stream => stream.socketId !== id));
      });

      socketRef.current.on("signal", handleSignal);

      socketRef.current.on("user-joined", (id, clients) => {
        clients.forEach(clientId => {
          if (clientId === socketIdRef.current || connections.current[clientId]) return;

          connections.current[clientId] = new RTCPeerConnection(peerConfigConnections);

          connections.current[clientId].onicecandidate = (event) => {
            if (event.candidate) {
              socketRef.current.emit("signal", clientId, JSON.stringify({ ice: event.candidate }));
            }
          };

          connections.current[clientId].ontrack = (event) => {
            setRemoteStreams(prev => {
              const existing = prev.find(s => s.socketId === clientId);
              if (existing) {
                return prev.map(s => 
                  s.socketId === clientId ? { ...s, stream: event.streams[0] } : s
                );
              }
              return [...prev, { socketId: clientId, stream: event.streams[0] }];
            });
          };

          // Add local tracks
          if (window.localStream) {
            window.localStream.getTracks().forEach(track => {
              try {
                connections.current[clientId].addTrack(track, window.localStream);
              } catch (error) {
                console.warn("Error adding track:", error);
              }
            });
          }

          // For new connections, create offer
          if (id === socketIdRef.current) {
            connections.current[clientId].createOffer()
              .then(offer => connections.current[clientId].setLocalDescription(offer))
              .then(() => {
                socketRef.current.emit("signal", clientId, JSON.stringify({
                  sdp: connections.current[clientId].localDescription
                }));
              });
          }
        });
      });

      socketRef.current.on("chat-message", (data, sender) => {
        setMessages(prev => [...prev, { sender, data }]);
        setNewMessages(prev => prev + 1);
      });
    });
  };

  const handleSignal = (fromId, message) => {
    const signal = JSON.parse(message);

    if (!connections.current[fromId]) {
      connections.current[fromId] = new RTCPeerConnection(peerConfigConnections);
      
      connections.current[fromId].onicecandidate = (event) => {
        if (event.candidate) {
          socketRef.current.emit("signal", fromId, JSON.stringify({ ice: event.candidate }));
        }
      };

      connections.current[fromId].ontrack = (event) => {
        setRemoteStreams(prev => [...prev, { socketId: fromId, stream: event.streams[0] }]);
      };

      if (window.localStream) {
        window.localStream.getTracks().forEach(track => {
          connections.current[fromId].addTrack(track, window.localStream);
        });
      }
    }

    if (signal.sdp) {
      const desc = new RTCSessionDescription(signal.sdp);
      connections.current[fromId].setRemoteDescription(desc)
        .then(() => {
          if (signal.sdp.type === 'offer') {
            return connections.current[fromId].createAnswer()
              .then(answer => connections.current[fromId].setLocalDescription(answer))
              .then(() => {
                socketRef.current.emit("signal", fromId, JSON.stringify({
                  sdp: connections.current[fromId].localDescription
                }));
              });
          }
        })
        .catch(error => console.error("Error setting remote description:", error));
    }

    if (signal.ice) {
      connections.current[fromId].addIceCandidate(new RTCIceCandidate(signal.ice))
        .catch(error => console.error("Error adding ICE candidate:", error));
    }
  };

  const toggleVideo = async () => {
    if (window.localStream) {
      const videoTrack = window.localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoEnabled;
        setVideoEnabled(!videoEnabled);
        
        // Replace track in all connections if screen sharing isn't active
        if (!isScreenSharing) {
          Object.keys(connections.current).forEach(id => {
            if (id === socketIdRef.current) return;
            
            const sender = connections.current[id].getSenders().find(s => s.track.kind === 'video');
            if (sender) {
              sender.replaceTrack(videoTrack);
            }
          });
        }
      }
    }
  };

  const toggleAudio = () => {
    if (window.localStream) {
      const audioTrack = window.localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioEnabled;
        setAudioEnabled(!audioEnabled);
      }
    }
  };

  const connect = () => {
    if (!username.trim()) return;
    setAskForUsername(false);
    connectToSocketServer();
  };

  const sendMessage = () => {
    if (!message.trim()) return;
    socketRef.current.emit("chat-message", message, username);
    setMessage("");
  };

  const handleEndCall = () => {
    Object.values(connections.current).forEach(peer => peer.close());
    if (window.localStream) {
      window.localStream.getTracks().forEach(track => track.stop());
    }
    if (screenStream.current) {
      screenStream.current.getTracks().forEach(track => track.stop());
    }
    socketRef.current?.disconnect();
    window.location.href = "/";
  };

  return (
    <div className={styles.meetContainer}>
      {askForUsername ? (
        <div className={styles.lobby}>
          <h2>Enter Meeting Lobby</h2>
          <TextField
            label="Your Name"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            fullWidth
            margin="normal"
          />
          <div className={styles.previewVideo}>
            <video ref={localVideoRef} autoPlay muted playsInline />
          </div>
          <Button 
            variant="contained" 
            color="primary" 
            onClick={connect}
            disabled={!username.trim()}
          >
            Join Meeting
          </Button>
        </div>
      ) : (
        <>
          {/* Main meeting UI */}
          <div className={styles.videoGrid}>
            {/* Local video with screen share toggle */}
            <div className={styles.localVideoContainer}>
              <video 
                ref={localVideoRef} 
                autoPlay 
                muted 
                playsInline 
                className={styles.localVideo}
              />
              <video
                ref={screenShareRef}
                autoPlay
                playsInline
                className={styles.screenShare}
                style={{ display: isScreenSharing ? 'block' : 'none' }}
              />
            </div>

            {/* Remote streams */}
            {remoteStreams.map((video, index) => (
              <div key={video.socketId} className={styles.remoteVideoContainer}>
                <video
                  ref={el => {
                    if (el && video.stream) {
                      el.srcObject = video.stream;
                    }
                  }}
                  autoPlay
                  playsInline
                  className={styles.remoteVideo}
                />
              </div>
            ))}
          </div>

          {/* Controls toolbar */}
          <div className={styles.controls}>
            <IconButton onClick={toggleVideo} color={videoEnabled ? "primary" : "secondary"}>
              {videoEnabled ? <VideocamIcon /> : <VideocamOffIcon />}
            </IconButton>
            <IconButton onClick={toggleAudio} color={audioEnabled ? "primary" : "secondary"}>
              {audioEnabled ? <MicIcon /> : <MicOffIcon />}
            </IconButton>
            <IconButton 
              onClick={handleScreenShare} 
              color={isScreenSharing ? "secondary" : "primary"}
            >
              {isScreenSharing ? <StopScreenShareIcon /> : <ScreenShareIcon />}
            </IconButton>
            <IconButton 
              onClick={() => setModal(!showModal)} 
              color="primary"
            >
              <Badge badgeContent={newMessages} color="error" max={99}>
                <ChatIcon />
              </Badge>
            </IconButton>
            <IconButton onClick={handleEndCall} style={{ color: 'red' }}>
              <CallEndIcon />
            </IconButton>
          </div>

          {/* Chat modal */}
          {showModal && (
            <div className={styles.chatModal}>
              <div className={styles.chatHeader}>
                <h3>Meeting Chat</h3>
                <IconButton onClick={() => setModal(false)}>
                  ×
                </IconButton>
              </div>
              <div className={styles.chatMessages}>
                {messages.length === 0 ? (
                  <p className={styles.noMessages}>No messages yet</p>
                ) : (
                  messages.map((msg, i) => (
                    <div 
                      key={i} 
                      className={`${styles.message} ${
                        msg.sender === username ? styles.myMessage : ''
                      }`}
                    >
                      <div className={styles.sender}>{msg.sender}</div>
                      <div className={styles.text}>{msg.data}</div>
                    </div>
                  ))
                )}
              </div>
              <div className={styles.chatInput}>
                <TextField
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Type a message"
                  fullWidth
                  onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                />
                <Button onClick={sendMessage}>Send</Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
