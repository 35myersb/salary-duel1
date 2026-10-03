import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import api from "../api/index.js";

const root=path.dirname(fileURLToPath(import.meta.url));
const publicDir=path.join(root,"public");
const mime={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8"};

const server=http.createServer(async(req,res)=>{
  if(req.url?.startsWith("/api/")) return api(req,res);
  const pathname=new URL(req.url||"/","http://localhost").pathname;
  const relative=pathname==="/"?"index.html":pathname.replace(/^\//,"");
  const full=path.resolve(publicDir,relative);
  if(!full.startsWith(publicDir)||!fs.existsSync(full)||!fs.statSync(full).isFile()){
    res.statusCode=404; return res.end("Not found");
  }
  res.setHeader("Content-Type",mime[path.extname(full)]||"application/octet-stream");
  fs.createReadStream(full).pipe(res);
});
server.listen(Number(process.env.PORT||3000));
