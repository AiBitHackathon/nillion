import express from "express";
import { SecretVaultWrapper } from "nillion-sv-wrappers";
import { orgConfig } from "./nillionOrgConfig.js";
import bodyParser from "body-parser";

const SCHEMA_NFT_ID = "e8317b4e-3b48-4f50-9adf-93be295a09e1";

const app = express();
app.use(bodyParser.json());

// Add CORS headers
app.use((req, res, next) => {
  const allowedOrigins = [
    "https://aibit-front-ic06d.kinsta.page",
    "https://localhost:8888" // Keep for local development
  ];
  
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
  }
  
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

app.get("/", (req, res) => {
  res.json({ message: "Hello from Nillion-based API for AIbit!" });
});

//----- WRITE DATA -----//

app.post("/add-nft-data", async (req, res) => {
  try {
    const { fitbitid, dateofupdate, level } = req.body;

    // Validate input
    if (!fitbitid || !dateofupdate || !level) {
      return res.status(400).json({
        error:
          "Missing required field(s). Provide fitbitid, dateofupdate, and level.",
      });
    }

    // Data structure matching the updated NFT schema
    const data = [
      {
        fitbitid: fitbitid,
        dateofupdate: { $allot: dateofupdate.toString() }, // Store as string and encrypt
        level: { $allot: level.toString() }, // Store as string and encrypt
      },
    ];

    // Initialize SecretVaultWrapper
    const collectionNFT = new SecretVaultWrapper(
      orgConfig.nodes,
      orgConfig.orgCredentials,
      SCHEMA_NFT_ID
    );
    await collectionNFT.init();

    // Write data to Nillion nodes
    const dataWritten = await collectionNFT.writeToNodes(data);
    console.log("Data written to nodes:", JSON.stringify(dataWritten, null, 2));

    // Extract newly created IDs
    const newIds = [
      ...new Set(
        dataWritten.flatMap((item) => item.result?.data?.created || [])
      ),
    ];
    console.log("Uploaded record IDs:", newIds);

    // Read back the data to confirm write success
    const decryptedCollectionData = await collectionNFT.readFromNodes({});
    console.log(
      "Most recent records:",
      decryptedCollectionData.slice(0, data.length)
    );

    return res.json({
      message: "NFT data added successfully!",
      createdRecordIds: newIds,
      allData: decryptedCollectionData.slice(0, data.length),
    });
  } catch (error) {
    console.error("Error in /add-nft-data:", error);
    return res.status(500).json({ error: error.message });
  }
});

//-----READ-----//

app.get("/get-latest-nft", async (req, res) => {
  try {
    const { fitbitid } = req.query;

    // Validate required query parameter
    if (!fitbitid) {
      return res
        .status(400)
        .json({ error: "Missing required query parameter: fitbitid" });
    }

    // Initialize SecretVaultWrapper
    const collectionNFT = new SecretVaultWrapper(
      orgConfig.nodes,
      orgConfig.orgCredentials,
      SCHEMA_NFT_ID
    );
    await collectionNFT.init();

    // Read ALL records from Nillion nodes
    const allNFTRecords = await collectionNFT.readFromNodes({});

    if (!allNFTRecords || allNFTRecords.length === 0) {
      return res.status(404).json({ error: "No NFT records found." });
    }

    // Manually filter records by `fitbitid`
    const userNFTRecords = allNFTRecords.filter(
      (record) => record.fitbitid === fitbitid
    );

    if (userNFTRecords.length === 0) {
      return res
        .status(404)
        .json({ error: `No NFT records found for fitbitid: ${fitbitid}` });
    }

    // Sort records by `dateofupdate` (latest first)
    userNFTRecords.sort(
      (a, b) =>
        parseInt(b.dateofupdate?.$share || b.dateofupdate || "0", 10) -
        parseInt(a.dateofupdate?.$share || a.dateofupdate || "0", 10)
    );

    // Get the most recent NFT update
    const latestNFTRecord = userNFTRecords[0];

    // Extract the relevant fields
    const response = {
      fitbitid: latestNFTRecord.fitbitid,
      dateofupdate:
        latestNFTRecord.dateofupdate?.$share ||
        latestNFTRecord.dateofupdate ||
        "Missing",
      level:
        latestNFTRecord.level?.$share || latestNFTRecord.level || "Missing",
    };

    return res.json(response);
  } catch (error) {
    console.error("Error in /get-latest-nft:", error);
    return res.status(500).json({ error: error.message });
  }
});

//----- LEADERBOARD-----//

app.get("/get-leaderboard", async (req, res) => {
  try {
    // Initialize SecretVaultWrapper
    const collectionNFT = new SecretVaultWrapper(
      orgConfig.nodes,
      orgConfig.orgCredentials,
      SCHEMA_NFT_ID
    );
    await collectionNFT.init();

    // Read ALL records from Nillion nodes
    const allNFTRecords = await collectionNFT.readFromNodes({});

    if (!allNFTRecords || allNFTRecords.length === 0) {
      return res.status(404).json({ error: "No NFT records found." });
    }

    // Organize by `fitbitid` and find the max `level`
    const leaderboardMap = {};

    allNFTRecords.forEach((record) => {
      const fitbitid = record.fitbitid;
      const level = parseInt(record.level?.$share || record.level || "0", 10);

      if (!leaderboardMap[fitbitid] || level > leaderboardMap[fitbitid]) {
        leaderboardMap[fitbitid] = level;
      }
    });

    // Convert leaderboard object to array and sort by level (highest first)
    const leaderboard = Object.entries(leaderboardMap)
      .map(([fitbitid, level]) => ({ fitbitid, level }))
      .sort((a, b) => b.level - a.level);

    return res.json({ leaderboard });
  } catch (error) {
    console.error("Error in /get-leaderboard:", error);
    return res.status(500).json({ error: error.message });
  }
});

// Start the server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});
