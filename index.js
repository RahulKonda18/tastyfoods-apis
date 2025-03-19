const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const bodyparser = require("body-parser");
const { MongoClient, ServerApiVersion } = require("mongodb");
const app = express();
app.use(cors());
app.use(bodyparser.json());
app.use(bodyparser.urlencoded({ extended: true }));

const uri =
  "mongodb+srv://rahulmadhukonda:C0LzpnPSRP8BqQF2@cluster0.oyk4b.mongodb.net/?appName=Cluster0";

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server (optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("tasty_kitchens").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
  }
}
run();

const secretKey = "$12@#SeCretKey##)(";

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, secretKey, async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        next();
      }
    });
  }
};

/// Validate password strength with detailed error messages
const validatePassword = (password) => {
  if (password.length < 8) {
    return {
      valid: false,
      error_msg: "Password must be at least 8 characters long.",
    };
  }
  if (!/[A-Z]/.test(password)) {
    return {
      valid: false,
      error_msg: "Password must contain at least one uppercase letter.",
    };
  }
  if (!/[a-z]/.test(password)) {
    return {
      valid: false,
      error_msg: "Password must contain at least one lowercase letter.",
    };
  }
  if (!/[0-9]/.test(password)) {
    return {
      valid: false,
      error_msg: "Password must contain at least one number.",
    };
  }
  if (!/[!@#\$%\^\&*\)\(+=._-]/.test(password)) {
    return {
      valid: false,
      error_msg: "Password must contain at least one special character.",
    };
  }
  return { valid: true };
};

app.post("/register", async (request, response) => {
  const { username, password } = request.body;
  console.log(username, password);

  if (!username || !password) {
    return response
      .status(400)
      .send({ error_msg: "Username and password are required" });
  }

  // Validate the password and return specific error messages
  const passwordValidation = validatePassword(password);
  if (!passwordValidation.valid) {
    return response
      .status(400)
      .send({ error_msg: passwordValidation.error_msg });
  }

  try {
    // Check if the user already exists in the MongoDB collection
    const dbUser = await client
      .db("tasty_kitchens") // Replace with your database name
      .collection("users") // Replace with your collection name
      .findOne({ username: username });

    if (!dbUser) {
      // Hash the password and insert the new user into the collection
      const hashedPassword = await bcrypt.hash(password, 10);
      const result = await client
        .db("tasty_kitchens")
        .collection("users")
        .insertOne({ username: username, password: hashedPassword });

      response.send({ msg: `Created new user with ID: ${result.insertedId}` });
    } else {
      response.status(400).send({ error_msg: "User already exists" });
    }
  } catch (error) {
    console.error("Error during registration:", error);
    response.status(500).send({ error: "Internal Server Error" });
  }
});

app.post("/login", async (request, response) => {
  const { username, password } = request.body;
  console.log(username, password);

  if (!username || !password) {
    return response
      .status(400)
      .send({ error_msg: "Username and Password are required" });
  }

  try {
    // Query the MongoDB collection to find the user by username
    const dbUser = await client
      .db("tasty_kitchens") // Replace with your database name
      .collection("users") // Replace with your collection name
      .findOne({ username: username });

    if (!dbUser) {
      response.status(400).send({ error_msg: "Invalid Username" });
    } else {
      // Compare the provided password with the hashed password in the database
      const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
      if (isPasswordMatched) {
        // Generate a JWT token
        const token = jwt.sign({ userId: dbUser.username }, secretKey, {
          expiresIn: "1h",
        });
        response.send({ msg: "Login Success!", jwt_token: token });
      } else {
        response.status(400).send({ error_msg: "Invalid Password" });
      }
    }
  } catch (error) {
    console.error("Error during login:", error);
    response.status(500).send({ error: "Internal Server Error" });
  }
});

app.get("/offers", authenticateToken, async (request, response) => {
  try {
    const offersArray = await client
      .db("tasty_kitchens")
      .collection("offers")
      .find({})
      .toArray();
    response.send(offersArray);
  } catch (error) {
    console.error("Error fetching offers:", error);
    response.status(500).send({ error: "Failed to fetch offers" });
  }
});

app.get(
  "/restaurants-list/:restaurantId",
  authenticateToken,
  async (request, response) => {
    const { restaurantId } = request.params;

    try {
      const result = await client
        .db("tasty_kitchens")
        .collection("restaurant_fooditems")
        .findOne({ id: restaurantId });

      if (result) {
        response.send(result);
      } else {
        response.status(404).send({ error: "Restaurant not found" });
      }
    } catch (error) {
      console.error("Error fetching restaurant:", error);
      response.status(500).send({ error: "Failed to fetch restaurant" });
    }
  }
);

app.get("/restaurants-list", authenticateToken, async (request, response) => {
  const { limit, offset, sort_by_rating } = request.query;

  try {
    // Determine the sort order based on the query parameter
    const order = sort_by_rating === "Lowest" ? 1 : -1; // 1 for ascending, -1 for descending

    // Query the MongoDB collection with sorting, limit, and offset
    const restaurantsList = await client
      .db("tasty_kitchens") // Replace with your database name
      .collection("restaurant_details") // Replace with your collection name
      .find({})
      .sort({ user_rating: order }) // Sort by user_rating
      .skip(parseInt(offset) || 0) // Skip the specified number of documents
      .limit(parseInt(limit) || 0) // Limit the number of documents returned
      .toArray();

    response.send(restaurantsList); // Send the list of restaurants as a JSON response
  } catch (error) {
    console.error("Error fetching restaurants:", error);
    response.status(500).send({ error: "Failed to fetch restaurants" }); // Handle server errors
  }
});

app.get("/", (req, res) => res.send("Everythings Good!"));

app.listen(3000, () => console.log("Server is running!"));
