const { MongoClient, ServerApiVersion } = require('mongodb');
const express = require('express');
const cors = require('cors');
require('dotenv').config(); 
const port = process.env.PORT || 5000;

const app = express()

//middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_NAME}:${process.env.DB_PASSWORD}@cluster0.ssvtwdw.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    }
  });

async function run(){
    try{
        const appointmentOptionCollection = client.db('doctorsPortal').collection('appointmentOptions');
        
        app.get('/appointmentOptions', async(req, res) =>{
            
            const query = {};
            const options = await appointmentOptionCollection.find(query).toArray();
            res.send(options);
            //console.log(options)
        })
    }
    finally{

    }
}
run().catch(console.log);


app.get('/', async(req, res) =>{
    res.send('doctors portal server is running');
});

app.listen(port, () =>console.log(`Doctors portal is running on ${port}`))