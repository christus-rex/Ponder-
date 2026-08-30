import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SUPPORTED_LANGUAGES,
  buildTranslationSessionRequest,
  safetyIdentifier,
} from "./translator-config.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const port = Number(process.env.PORT || 8787);
const apiKey = process.env.OPENAI_API_KEY;

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function sendJson(res, statusCode, value) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(value));
}

async function readJson(req) {
  const chunks = [];
  let size = 0;

  for await (const chunk of req) {
    size += chunk.length;
    if (size > 32_768) {
      throw new Error("Request body too large");
    }
    chunks.push(chunk);
  }

  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function createTranslationClientSecret(req, res) {
  if (!apiKey) {
    return sendJson(res, 500, {
      error: "OPENAI_API_KEY is not configured on the server.",
    });
  }

  try {
    const body = await readJson(req);
    const session = buildTranslationSessionRequest(body.targetLanguage);

    // Demo identity only. In production use the authenticated Ponder+ user ID.
    const userIdentity =
      req.headers["x-ponder-user-id"] ||
      `${req.socket.remoteAddress || "unknown"}:translator-demo`;

    const response = await fetch(
      "https://api.openai.com/v1/realtime/translations/client_secrets",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "OpenAI-Safety-Identifier": safetyIdentifier(userIdentity),
        },
        body: JSON.stringify(session),
      },
    );

    const payload = await response.json().catch(() => ({
      error: { message: "OpenAI returned a non-JSON response." },
    }));

    if (!response.ok) {
      return sendJson(res, response.status, {
        error:
          payload?.error?.message ||
          "Unable to create a realtime translation session.",
      });
    }

    return sendJson(res, 200, payload);
  } catch (error) {
    const status = error instanceof RangeError ? 400 : 500;
    return sendJson(res, status, { error: error.message });
  }
}

async function serveStatic(req, res) {
  const requestPath =
    req.url === "/" ? "/index.html" : new URL(req.url, "http://localhost").pathname;
  const normalized = path.normalize(requestPath).replace(/^([.][.][/\\])+/, "");
  const filePath = path.join(publicDir, normalized);

  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403).end("Forbidden");
    return;
  }

  try {
    const content = await readFile(filePath);
    res.writeHead(200, {
      "Content-Type":
        contentTypes[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(content);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/api/translator/languages") {
    return sendJson(res, 200, SUPPORTED_LANGUAGES);
  }

  if (req.method === "POST" && req.url === "/api/translator/session") {
    return createTranslationClientSecret(req, res);
  }

  if (req.method === "GET") {
    return serveStatic(req, res);
  }

  res.writeHead(405, { Allow: "GET, POST" });
  res.end("Method not allowed");
});

server.listen(port, () => {
  console.log(`Ponder+ live translator demo: http://localhost:${port}`);
});
