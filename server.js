const express = require("express");
const cors = require("cors");
const ffmpeg = require("fluent-ffmpeg");
const path = require("path");
const fs = require("fs");
const axios = require("axios");
const { v4: uuidv4 } = require("uuid");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8080;

// Create folders if not exist
const videosDir = path.join(__dirname, "videos");
const tempDir = path.join(__dirname, "temp");

if (!fs.existsSync(videosDir)) fs.mkdirSync(videosDir);
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

// ✅ USE DIRECT DROPBOX IMAGE LINK (dl.dropboxusercontent.com)
const backgroundImage =
  "https://dl.dropboxusercontent.com/scl/fi/bzy46bdurxp3hxo33eofy/thiruvalluvar_background.jpg?rlkey=a7n3mlhull5tpgrg45jmpl636&st=upz2ig9y&dl=1";

// Render API
app.post("/render", async (req, res) => {
  try {
    const { title, script, audio_url } = req.body;

    if (!title || !script || !audio_url) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const id = uuidv4();
    const outputVideo = path.join(videosDir, `${id}.mp4`);
    const tempAudio = path.join(tempDir, `${id}.mp3`);

    // Download audio
    const response = await axios({
      method: "GET",
      url: audio_url,
      responseType: "stream",
    });

    const writer = fs.createWriteStream(tempAudio);
    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on("finish", resolve);
      writer.on("error", reject);
    });

    // Escape text for FFmpeg
    const safeTitle = title.replace(/:/g, "\\:").replace(/'/g, "\\'");
    const safeScript = script.replace(/:/g, "\\:").replace(/'/g, "\\'");

    ffmpeg()
      .input(backgroundImage)
      .inputOptions(["-loop 1"])
      .input(tempAudio)
      .videoCodec("libx264")
      .audioCodec("aac")
      .size("540x960")
      .outputOptions([
        "-shortest",
        "-pix_fmt yuv420p",
        "-preset ultrafast",
        "-crf 28",
        "-vf",
        `
drawbox=x=0:y=0:w=iw:h=ih:color=black@0.35:t=fill,
drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:
text='${safeTitle}':
fontsize=70:
fontcolor=gold:
x=(w-text_w)/2:
y=h*0.08:
shadowcolor=black:
shadowx=2:
shadowy=2,
drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:
text='${safeScript}':
fontsize=45:
fontcolor=white:
x=w*0.1:
y=h*0.65:
box=1:
boxcolor=black@0.5:
boxborderw=20,
drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:
text='Thirukural Series':
fontsize=30:
fontcolor=white:
x=(w-text_w)/2:
y=h*0.93
`,
      ])
      .save(outputVideo)
      .on("end", () => {
        fs.unlinkSync(tempAudio);

        res.json({
          success: true,
          video_url: `${req.protocol}://${req.get("host")}/video/${id}`,
        });
      })
      .on("error", (err) => {
        console.error("FFmpeg Error:", err);
        res.status(500).json({ error: "FFmpeg failed" });
      });
  } catch (error) {
    console.error("Server Error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Serve video
app.get("/video/:id", (req, res) => {
  const videoPath = path.join(videosDir, `${req.params.id}.mp4`);

  if (fs.existsSync(videoPath)) {
    res.sendFile(videoPath);
  } else {
    res.status(404).json({ error: "Video not found" });
  }
});

app.get("/", (req, res) => {
  res.send("Thirukural Video Engine Running");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
