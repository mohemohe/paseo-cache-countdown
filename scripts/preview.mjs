import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  resolve: { alias: { "react-native": "react-native-web" } },
  server: { host: "127.0.0.1", port: 4173, strictPort: true },
});
await server.listen();
console.log("Countdown component preview: http://127.0.0.1:4173/preview/");
