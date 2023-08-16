const { MongoClient, ServerApiVersion, ObjectId, Transaction } = require('mongodb');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const nodemailer = require("nodemailer");
require('dotenv').config(); 
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);


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

function sendBookingEmail(booking){
    const {email,treatment,appointmentDate,slot} = booking;

    
    let transporter = nodemailer.createTransport({
        host: 'smtp.sendgrid.net',
        port: 587,
        auth: {
            user: process.env.SENDGRID_USER,
            pass: process.env.SENDGRID_API_KEY
        }
     })

     transporter.sendMail({
        from: "ashfaqraju27@gmail.com", // verified sender email
        to: `${email}`, // recipient email
        subject: `Your appointment for ${treatment} is confirm`, // Subject line
        text: "Email Body", // plain text body
        html: `
        <h3 className="text-lg text-emerald-400">Your appointment is confirmed.</h3>
        <div>
            <p>Your appointment for treatment: ${treatment}</p>
            <p>Please visit on us at ${appointmentDate} at ${slot}</p>
            <p>Thanks for using Doctor's Portal.</p>
        </div>
        `, // html body
      }, function(error, info){
        if (error) {
          console.log(error);
        } else {
          console.log('Email sent: ' + info.response);
        }
      });
      console.log(transporter.sendMail);
}

function verifyJWT(req, res, next){
    
    //console.log('TOken inside',req.headers.authorization);
    const authHeader = req.headers.authorization;
    if(!authHeader){
        return res.status(401).send('unauthorized access');
    }
    const token = authHeader.split(' ')[1];

    jwt.verify(token, process.env.ACCESS_TOKEN, function (err , decoded){
        if(err){
            return res.status(403).send({message: 'forbidden access'})
        }
        req.decoded = decoded; 
        next();
    })
}

async function run(){
    try{
        const appointmentOptionCollection = client.db('doctorsPortal').collection('appointmentOptions');
        const bookingCollection = client.db('doctorsPortal').collection('bookings');
        const usersCollection = client.db('doctorsPortal').collection('users');
        const doctorsCollection = client.db('doctorsPortal').collection('doctors');
        const paymentsCollection = client.db('doctorsPortal').collection('payments');
        
        //verify admin role for the work
        //make sure you use verifyAdmin after verifyJwt
        const verifyAdmin = async (req, res, next) =>{
            const decodedEmail = req.decoded.email;
            const query = { email: decodedEmail };
            const user = await usersCollection.findOne(query);

            if (user?.role !== 'admin') {
                return res.status(403).send({ message: 'forbidden access' })
            }
            next();
            
        }


        //use Aggregate to query multiple collection & then merge data
        app.get('/appointmentOptions', async(req, res) =>{
            const date = req.query.date;
            const query = {};
            const options = await appointmentOptionCollection.find(query).toArray();

            // get the bookings of the provided date
            const bookingQuery = { appointmentDate: date}
            const alreadyBooked = await bookingCollection.find(bookingQuery).toArray();

            // code carefully :D
            options.forEach(option => {
                const optionBooked = alreadyBooked.filter(book => book.treatment === option.name);
                const bookedSlots = optionBooked.map(book => book.slot);
                const remainingSlots = option.slots.filter(slot => !bookedSlots.includes(slot));
                option.slots = remainingSlots;
            })
            res.send(options);
        });


        // Advanced formula for backend
        /* app.get('/v2/appointment', async (req,res)=>{
            const date = req.query.date;
            const options = await appointmentOptionCollection.aggregate([
                {
                    $lookup: {
                        from: 'bookings',
                        localField: 'name',
                        foreignField: 'treatment',
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $eq : ['$appointmentDate', date]
                                    }
                                }
                            }
                         ],
                        as: 'booked',
                    }
                },
                {
                    $project: {
                        name: 1,
                        slots : 1,
                        booked: {
                            $map: {
                                input: '$booked',
                                as: 'book',
                                in: '$$book.slot'
                            }
                        }
                    }
                },
                {
                    $project: {
                        name: 1,
                        slots: {
                            $setDifference: ['$slots', '$booked']
                        }
                    }
                }
            ]).toArray();
            res.send(options);
        }) */

        app.get('/appointmentSpecialty', async(req, res) =>{
            const query = {};
            const result = await appointmentOptionCollection.find(query).project({name: 1}).toArray();
            res.send(result);
        })
        
        /*
            *API Naming Conventions
            *app.get('/bookings')
            *app.get('/bookings/:id')
            *app.post('bookings')
            *app.patch('/bookings/id')
            *app.delete('bookings/:id') 
        */

        app.get('/bookings', async(req, res) =>{
            const email = req.query.email;
            /* const decodedEmail = req.decoded.email;
            if(email !== decodedEmail){
                return res.status(403).send({message: 'forbidden access'})
            } */
            const query = {email: email};
            const bookings = await bookingCollection.find(query).toArray();
            res.send(bookings); 
        });

        app.get('/bookings/:id', async(req, res) =>{
            const id = req.params.id;
            const query = {_id : new ObjectId(id)};
            const booking = await bookingCollection.findOne(query);
            res.send(booking);
        } )

        app.post('/bookings', async(req, res) =>{
            const booking = req.body;
            console.log('inside booking',booking)
            const query = {
                appointmentDate: booking.appointmentDate,
                email : booking.email,
                treatment: booking.treatment
            }

            const alreadyBooked = await bookingCollection.find(query).toArray();
            if(alreadyBooked.length)
            {
                const message = `You already have a booking on ${booking.appointmentDate}`;
                return res.send({acknowledge: false, message});
            }

            const result = await bookingCollection.insertOne(booking);

            //send email about appointment confirmation
            sendBookingEmail(booking);
            res.send(result);
        });

        //Payment API
        app.post('/create-payment-intent', async(req, res) =>{
            const booking = req.body;
            const price =  booking.price;
            const amount = price * 100;
            
            
            const paymentIntent = await stripe.paymentIntents.create({
                currency: 'usd',
                amount: amount,
                "payment_method_types" : [
                    "card"
                ]
            });
            console.log(paymentIntent);
            res.send({
                clientSecret : paymentIntent.client_secret
            })
        });

        app.post('/payments', async(req, res) =>{
            const payment = req.body;
            const result = await paymentsCollection.insertOne(payment);
            const id = payment.bookingId;
            const filter = {_id : new ObjectId(id)}
            const updatedDoc = {
                $set:{
                    paid: true,
                    transactionId : payment.transactionId 
                }
            }
            const updatedResult = await bookingCollection.updateOne(filter, updatedDoc)
            res.send(result);
        })

        app.get('/jwt', async(req, res) =>{
            const email = req.query.email;
            const query = {email : email}
            const user = await usersCollection.findOne(query);
            if(user ){
                const token =  jwt.sign({email}, process.env.ACCESS_TOKEN, {expiresIn: '365d'});
                return res.send({accessToken: token})
            }
            console.log('users info',user);
            res.status(403).send({accessToken: 'jwt'});
        })

        app.get('/users', async(req, res)=>{
            const query ={};
            const users = await usersCollection.find(query).toArray();
            res.send(users);
        });

        app.get('/users/admin/:email', async(req, res) =>{
            const email = req.params.email;
            const query = { email };
            const user = await usersCollection.findOne(query);
            res.send({isAdmin : user?.role === 'admin'});
        })

        app.post('/users', async(req, res) =>{
            const user = req.body;
            const result = await usersCollection.insertOne(user);
            res.send(result);
        });

        app.put('/users/admin/:id', async(req, res) =>{
            const decodedEmail = req.decoded.email;
            const query = {email: decodedEmail}
            const user = await usersCollection.findOne(query);
            if(user?.role !== 'admin'){
                return res.status(403).send({message: 'forbidden access'})
            }


            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const options = { upsert: true };
            const updatedDoc = {
                $set: {
                    role : 'admin'
                }
            }
            const result =  await usersCollection.updateOne(filter, updatedDoc, options);
            res.send(result);
        })

        //temporary to update price field appointment option

        /* app.put('/addPrice', async (req, res) =>{
            const filter = {};
            const options = {upsert : true}
            const updatedDoc = {
                $set :{
                    price: 99
                }
            }
            const result = await appointmentOptionCollection.updateMany(filter, options, updatedDoc);
            res.send(result);
        }) */


        //Doctors Section
        app.get('/doctors',  async (req, res) => {
            const query = {};
            const doctors = await doctorsCollection.find(query).toArray();
            console.log(doctors);
            res.send(doctors);
        })

        app.post('/doctors',  async (req, res) => {
            const doctor = req.body;
            const result = await doctorsCollection.insertOne(doctor);
            res.send(result);
        });

        app.delete('/doctors/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id:new ObjectId(id) };
            const result = await doctorsCollection.deleteOne(filter);
            res.send(result);
        })
        
    }
    finally{

    }
}
run().catch(console.log());


app.get('/', async(req, res) =>{
    res.send('doctors portal server is running');
});

app.listen(port, () =>console.log(`Doctors portal is running on ${port}`))