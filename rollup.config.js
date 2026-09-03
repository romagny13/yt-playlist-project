import terser from "@rollup/plugin-terser";

export default {
  input: "src/yt-playlist.js",
  output: [
    {
      file: "dist/yt-playlist.js",
      format: "umd",
      name: "YTPlaylist",
      exports: "default"
    },
    {
      file: "dist/yt-playlist.min.js",
      format: "umd",
      name: "YTPlaylist",
      exports: "default",
      plugins: [terser()]
    }
  ]
};