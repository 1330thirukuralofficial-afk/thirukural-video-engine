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

const PORT = process.env.PORT || 10000;

ffmpeg.setFfmpegPath("/usr/bin/ffmpeg");

const videosDir = path.join(__dirname, "videos");
const tempDir = path.join(__dirname, "temp");

if (!fs.existsSync(videosDir)) fs.mkdirSync(videosDir);
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

// ✅ DIRECT DROPBOX BACKGROUND IMAGE
const backgroundImageURL =
  "https://dl.dropboxusercontent.com/scl/fi/bzy46bdurxp3hxo33eofy/thiruvalluvar_background.jpg?rlkey=a7n3mlhull5tpgrg45jmpl636&st=upz2ig9y&dl=1";

app.post("/render", async (req, res) => {
  try {
    const { title, script, audio_url } = req.body;

    if (!title || !script || !audio_url) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const id = uuidv4();
    const outputVideo = path.join(videosDir, `${id}.mp4`);
    const tempAudio = path.join(tempDir, `${id}.mp3`);
    const tempImage = path.join(tempDir, `${id}.jpg`);

    // Download audio
    const audioResponse = await axios({
      method: "GET",
      url: audio_url,
      responseType: "stream",
    });

    const audioWriter = fs.createWriteStream(tempAudio);
    audioResponse.data.pipe(audioWriter);

    await new Promise((resolve, reject) => {
      audioWriter.on("finish", resolve);
      audioWriter.on("error", reject);
    });

    // Download background image
    const imageResponse = await axios({
      method: "GET",
      url: backgroundImageURL,
      responseType: "stream",
    });

    const imageWriter = fs.createWriteStream(tempImage);
    imageResponse.data.pipe(imageWriter);

    await new Promise((resolve, reject) => {
      imageWriter.on("finish", resolve);
      imageWriter.on("error", reject);
    });

    const safeTitle = title.replace(/'/g, "\\'").replace(/:/g, "\\:");
    const safeScript = script.replace(/'/g, "\\'").replace(/:/g, "\\:");

    ffmpeg()
      .input(tempImage)
      .inputOptions(["-loop 1"])
      .input(tempAudio)
      .videoCodec("libx264")
      .audioCodec("aac")
      .size("720x1280")
      .outputOptions([
        "-preset veryfast",
        "-crf 23",
        "-shortest",
        "-pix_fmt yuv420p",
        "-r 30",
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
shadowx=3:
shadowy=3,
drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:
text='${safeScript}':
fontsize=42:
fontcolor=white:
x=w*0.1:
y=h*0.65:
box=1:
boxcolor=black@0.6:
boxborderw=25,
drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:
text='Thirukural Series':
fontsize=28:
fontcolor=white:
x=(w-text_w)/2:
y=h*0.93
`
      ])
      .save(outputVideo)
      .on("end", () => {
        fs.unlinkSync(tempAudio);
        fs.unlinkSync(tempImage);

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
