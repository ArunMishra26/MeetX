# 🎥 MeetX - Real-Time Video Conferencing App

MeetX is a full-stack video conferencing web application built using **React**, **Socket.IO**, and **WebRTC**. It enables seamless one-on-one and small group video calls directly in the browser — no plugins required!

Can Visit on  https://meetx-1-8vl0.onrender.com


## 🚀 Features

- 🔴 Real-time audio & video communication via **WebRTC**
- 📡 Peer-to-peer connection with **Socket.IO signaling**
- 🖥️ Screen sharing support
- 💬 Real-time text chat
- 🎙️ Toggle mic and camera
- ❌ End call with a single click
- 🧑‍🤝‍🧑 Supports multiple users (up to 4–5 in mesh architecture)

---

## 🛠️ Tech Stack

| 🗂️ **Category**            | 💻 **Technology / Tool**          | 🛠️ **Purpose / Description**                          |
| --------------------------- | --------------------------------- | ------------------------------------------------------ |
| **Frontend**                | React.js                          | Component-based UI development                         |
|                             | Material UI (MUI)                 | Pre-designed React components and UI elements          |
|                             | HTML, CSS, JavaScript             | Base layout, styling, and interactivity                |
| **Backend**                 | Node.js                           | JavaScript runtime environment for server-side logic   |
|                             | Express.js                        | Minimal and flexible Node.js web framework             |
| **Real-Time Communication** | Socket.IO                         | WebSocket-based real-time bi-directional communication |
|                             | WebRTC                            | Peer-to-peer video/audio connection between clients    |
| **Media APIs**              | MediaStream API                   | Captures user video, audio, and screen                 |
|                             | getUserMedia(), getDisplayMedia() | Access camera, mic, and screen with permissions        |


## 📦 Installation

### 1. Clone the Repository

```bash
git clone https://github.com/ArunMishra26/MeetX.git
cd MeetX


# Backend
cd backend
npm install


# Frontend
cd frontend
npm install


# Start Backend Server
cd backend
node index.js

# Start Frontend
cd frontend
npm start

App runs on: http://localhost:3000


🌍 Architecture Overview

[ Browser ] ←→ [ WebRTC ] ←→ [ Other Browsers ]
     ↑                          ↑
     ↓                          ↓
[ React Frontend ] ←→ [ Socket.IO Server ]

