let IS_PROD = true; 


const server = IS_PROD?
    "https://meetx-586v.onrender.com":

    "http://localhost:8000"


export default server;