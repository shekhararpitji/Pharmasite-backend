const bodyParser = require("body-parser");
const express = require("express");
const cors= require('cors');
require("dotenv").config();
const roleRoutes = require("./routes/roleRoutes");
const dataRoutes = require("./routes/dataRoutes");
const syncDb = require('./models/sync.db')


syncDb();

const port = process.env.PORT || 8080;
const app = express();

const postmanToOpenApi= require('postman-to-openapi');
const path = require("path");
const YAML = require('yamljs');
const swaggerUI = require('swagger-ui-express');
const swaggerSpec = require('./swagger');
app.use(bodyParser.json());

app.use(express.json());
app.use(cors());
app.use('/api-docs', swaggerUI.serve, swaggerUI.setup(swaggerSpec));


app.use("/role", roleRoutes);
app.use("/data", dataRoutes);

// postmanToOpenApi(
//     "src/postman/DTH.json",
//     path.join("src/postman/swagger.yml"),
//     {defaultTags:"General"}
// ).then((response)=>{
//     let result=YAML.load("src/postman/swagger.yml");
//     result.servers[0].url="/";
//     app.use("/swagger",swaggerUi.serve, swaggerUi.setup(result));
// })

app.listen(port, () => console.log(`Server is running on port ${port}`));