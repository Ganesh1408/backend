const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const cors = require("cors");
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

const app = express();
app.use(express.json());
app.use(cors());
const jsonMiddleware = express.json();
app.use(jsonMiddleware);


const dbPath = path.join(__dirname, "info.db");
let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

//middleware

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
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        next();
      }
    });
  }
};

// POST transaction details
app.post("/transactions",authenticateToken,  async (request, response) => {
  try {
    const { type, category, amount, date, description } = request.body;
    const addTransaction = `
      INSERT INTO transactions (type, category, amount, date, description)
      VALUES ('${type}', '${category}', '${amount}', '${date}', '${description}');
    `;
    const dbResponse = await db.run(addTransaction);
    const id = dbResponse.lastID;
    response.send({ id: id });
  } catch (error) {
    console.error("Error in POST /transactions:", error.message);
    response.status(500).send("Error adding transaction");
  }
});

// GET all transactions
app.get("/transactions", authenticateToken, async (request, response) => {
  const getTransactions = `SELECT * FROM transactions;`;
  const transactions = await db.all(getTransactions);
  response.send(transactions);
});

// GET transaction by ID
app.get("/transactions/:id", authenticateToken, async (request, response) => {
  const { id } = request.params;

  try{
    const transaction = await db.get(
      `SELECT * FROM transactions WHERE id = ?`,
      [id]
    );
    if(!transaction){
      return response.status(404).send({error:"Transaction not available"});
    }
  
  const getUniqueTransaction = `SELECT * FROM transactions WHERE id = ${id};`
  const uniqueTransaction = await db.get(getUniqueTransaction);
  response.send(uniqueTransaction)
} catch (error) {
  console.error(error);
  // Send a 500 response for any server error
  response
    .status(500)
    .send({ error: "An error occurred while updating the transaction" });
}
});

// PUT (update) transaction by ID
app.put("/transactions/:id", authenticateToken, async (request, response) => {
  const { id } = request.params;
  const { type, category, amount, date, description } = request.body;
  try {

    const transaction = await db.get(
      `SELECT * FROM transactions WHERE id = ?`,
      [id]
    );

    if (!transaction) {
      return response.status(404).send({ error: "Transaction not found" });
    }

    const updateQuery = `
    UPDATE transactions
    SET type = '${type}', category = '${category}', amount = '${amount}', date = '${date}', description = '${description}'
    WHERE id = ${id};
  `;

    await db.run(updateQuery);
    response.send("Transaction updated successfully");
  } catch (error) {
    console.error(error);
    // Send a 500 response for any server error
    response
      .status(500)
      .send({ error: "An error occurred while updating the transaction" });
  }
});

//delete transaction

app.delete("/transactions/:id", authenticateToken, async (request, response) => {
  const { id } = request.params;
  try{
    const transaction = await db.get(
      `SELECT * FROM transactions WHERE id = ?`,
      [id]
    );
    if(!transaction){
      return response.status(404).send({error:"Transaction not available"});
    }
  
  const deleteQuery = `
  DELETE FROM TRANSACTIONS WHERE id = ${id};
  `;
  await db.run(deleteQuery);
  response.send("Record deleted successfully");
}catch{
  response
      .status(500)
      .send({ error: "An error occurred while deleting the transaction" });
}
});

//summary
app.get("/summary", authenticateToken, async (request, response) => {
  const summaryQuery = `
    SELECT 
    SUM(CASE WHEN UPPER(type) = 'INCOME' THEN amount ELSE 0 END) AS total_income,
    SUM(CASE WHEN UPPER(type) = 'EXPENSE' THEN amount ELSE 0 END) AS total_expenses,
    SUM(CASE WHEN UPPER(type) = 'INCOME' THEN amount ELSE 0 END) - 
    SUM(CASE WHEN UPPER(type) = 'EXPENSE' THEN amount ELSE 0 END) AS balance
  FROM transactions;
  

  `;
  const summary = await db.get(summaryQuery);
  console.log(summary);
  response.send(summary);
});

// register user
app.post("/users/",async(request,response)=>{
  const {username, name,password,gender,location}=request.body;
  console.log(request.body.password)
  const hashedPassword = await bcrypt.hash(request.body.password,10);
  const userQuery =`select * from user where username='${username}'`;
  const dbUser = await db.get(userQuery);
  if (dbUser===undefined){
    const createUserQuery =
    `
    INSERT INTO user(username,name,password,gender,location)
    VALUES(
      '${username}',
      '${name}',
      '${hashedPassword}',
      '${gender}',
      '${location}'

    )
    `;
    const dbResponse=await db.run(createUserQuery)
    const newUserId = dbResponse.lastID;
    console.log(newUserId);
    response.send(`Created new user with '${newUserId}`);
  } else{
    response.status=400;
    response.send("User already exists")
  }
});

//login

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  console.log(request.body.password);
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  console.log(dbUser)
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid User");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    console.log(isPasswordMatched)
    if (isPasswordMatched === true) {
        const payload = {
          username: username,
        };
        const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
        console.log(jwtToken)
        
        response.send({ jwtToken });

  
    } else {
      response.status(400);
      response.send("Invalid Password");
    }
  }
});

