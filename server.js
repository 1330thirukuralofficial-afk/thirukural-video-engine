const express = require("express");
const axios = require("axios");
const fs = require("fs-extra");
const ffmpeg = require("fluent-ffmpeg");
const { v4: uuidv4 } = require("uuid");
const path = require("path");

const app = express();
app.use(express.json({ limit: "50mb" }));

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});

// Change this to your public background image URL
const BACKGROUND_URL = "https://www.dropbox.com/scl/fi/bzy46bdurxp3hxo33eofy/thiruvalluvar_background.jpg?rlkey=a7n3mlhull5tpgrg45jmpl636&st=r2dsts58&dl=1";

async function downloadFile(url, outputPath) {
  const response = await axios({
    url,
    method: "GET",
    responseType: "stream",
  });
  return new Promise((resolve, reject) => {
    const stream = response.data.pipe(fs.createWriteStream(outputPath));
    stream.on("finish", resolve);
    stream.on("error", reject);
  });
}

app.get("/", (req, res) => {
  res.send("Video engine running");
});

app.post("/render", async (req, res) => {
  try {
    const { title, script, audio_url } = req.body;

    if (!title || !script || !audio_url) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const id = uuidv4();
    const workDir = path.join(__dirname, "tmp", id);
    await fs.ensureDir(workDir);

    const bgPath = path.join(workDir, "background.jpg");
    const audioPath = path.join(workDir, "audio.mp3");
    const outputPath = path.join(workDir, "output.mp4");

    await downloadFile(BACKGROUND_URL, bgPath);
    await downloadFile(audio_url, audioPath);

    ffmpeg()
      .input(bgPath)
      .loop()
      .input(audioPath)
      .videoCodec("libx264")
      .audioCodec("aac")
      .outputOptions([
        "-preset ultrafast",
        "-crf 28",
        "-threads 1",
        "-t 10",
        "-pix_fmt yuv420p"
        "-vf",
        `scale=720:1280,drawtext=text='${title}':fontcolor=gold:fontsize=60:x=(w-text_w)/2:y=100,drawtext=text='${script.replace(
          /'/g,
          "\\'"
        )}':fontcolor=white:fontsize=40:x=(w-text_w)/2:y=(h-text_h)/2`
      ])
      .save(outputPath)
      .on("end", async () => {
        const videoUrl = `${req.protocol}://${req.get(
          "host"
        )}/video/${id}`;
        res.json({ success: true, video_url: videoUrl });
      })
      .on("error", (err) => {
        console.error(err);
        res.status(500).json({ error: "FFmpeg failed" });
      });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/video/:id", async (req, res) => {
  const id = req.params.id;
  const filePath = path.join(__dirname, "tmp", id, "output.mp4");
  if (await fs.pathExists(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).json({ error: "Video not found" });
  }

});
