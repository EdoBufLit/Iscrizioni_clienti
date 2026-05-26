const fs = require("fs");
const path = require("path");

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function write(filePath, content) {
  fs.writeFileSync(filePath, content, "utf8");
}

function replaceRegexOrThrow(source, pattern, replacement, label) {
  if (!pattern.test(source)) {
    throw new Error(`Unable to locate snippet for ${label}`);
  }
  return source.replace(pattern, replacement);
}

function patchChannelService(repoRoot, patchRoot) {
  const filePath = path.join(repoRoot, "src", "api", "services", "channel.service.ts");
  let source = read(filePath);

  const fetchMessagesPattern = /select:\s*\{\s*id: true,\s*key: true,\s*pushName: true,\s*messageType: true,\s*message: true,\s*messageTimestamp: true,\s*instanceId: true,\s*source: true,\s*contextInfo: true,\s*MessageUpdate:\s*\{\s*select:\s*\{\s*status: true,\s*\},\s*\},\s*\},/m;
  const fetchMessagesReplacement = `select: {
        id: true,
        key: true,
        pushName: true,
        participant: true,
        messageType: true,
        message: true,
        messageTimestamp: true,
        instanceId: true,
        source: true,
        contextInfo: true,
        status: true,
        MessageUpdate: {
          select: {
            status: true,
          },
        },
      },`;
  source = replaceRegexOrThrow(source, fetchMessagesPattern, fetchMessagesReplacement, "channel.service fetchMessages select");

  const fetchChatsStart = source.indexOf("  public async fetchChats(query: any) {");
  if (fetchChatsStart === -1) {
    throw new Error("Unable to locate fetchChats in channel.service.ts");
  }
  const classEnd = source.lastIndexOf("\n}");
  if (classEnd === -1 || classEnd <= fetchChatsStart) {
    throw new Error("Unable to locate ChannelStartupService class ending");
  }

  const fetchChatsReplacement = read(path.join(patchRoot, "channel.fetchChats.tsfrag"));
  source = `${source.slice(0, fetchChatsStart)}${fetchChatsReplacement}`;
  write(filePath, source);
}

function patchBaileysService(repoRoot, patchRoot) {
  const filePath = path.join(
    repoRoot,
    "src",
    "api",
    "integrations",
    "channel",
    "whatsapp",
    "whatsapp.baileys.service.ts",
  );
  let source = read(filePath);

  const chatFindMarker = "const existingChat = await this.prismaRepository.chat.findFirst({";
  const upsertAnchor = source.indexOf("if (settings?.groupsIgnore && received.key.remoteJid.includes('@g.us'))");
  const upsertStart = source.indexOf(chatFindMarker, upsertAnchor);
  const upsertEnd = source.indexOf("const messageRaw =", upsertStart);
  if (upsertAnchor === -1 || upsertStart === -1 || upsertEnd === -1) {
    throw new Error("Unable to locate messages.upsert chat handling block");
  }
  source = `${source.slice(0, upsertStart)}await this.ensureChatRecord(received.key.remoteJid, received.pushName);\n\n          ${source.slice(upsertEnd)}`;

  const updateAnchor = source.indexOf("const message: any = {");
  const updateStart = source.indexOf(chatFindMarker, updateAnchor);
  const updateEnd = source.indexOf("await Promise.all", updateStart);
  if (updateAnchor === -1 || updateStart === -1 || updateEnd === -1) {
    throw new Error("Unable to locate messages.update chat handling block");
  }
  source = `${source.slice(0, updateStart)}await this.ensureChatRecord(message.remoteJid, findMessage.pushName);\n        }\n      }\n\n      ${source.slice(updateEnd)}`;

  const groupHandlerAnchor = "  private readonly groupHandler = {";
  if (!source.includes(groupHandlerAnchor)) {
    throw new Error("Unable to locate groupHandler anchor");
  }
  if (!source.includes("private async ensureChatRecord")) {
    const helper = read(path.join(patchRoot, "baileys.ensureChatRecord.tsfrag"));
    source = source.replace(groupHandlerAnchor, `${helper}${groupHandlerAnchor}`);
  }

  if (!source.includes("fireInitQueries: process.env.EVOLUTION_FIRE_INIT_QUERIES === 'true',")) {
    source = replaceRegexOrThrow(
      source,
      /fireInitQueries:\s*true,/,
      "fireInitQueries: process.env.EVOLUTION_FIRE_INIT_QUERIES === 'true',",
      "baileys fireInitQueries",
    );
  }

  write(filePath, source);
}

function main() {
  const repoRoot = process.argv[2];
  if (!repoRoot) {
    throw new Error("Usage: node patch_evolution_lite.js <repo-root>");
  }
  const patchRoot =
    process.env.EVOLUTION_PATCH_ROOT ||
    path.join(__dirname, "..", "docker", "evolution-lite", "patches");

  patchChannelService(repoRoot, patchRoot);
  patchBaileysService(repoRoot, patchRoot);
}

main();
