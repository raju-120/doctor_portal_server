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
        const bookingCollection = client.db('doctorsPortal').collection('bookings');
        
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

        /*
            *API Naming Conventions
            *app.get('/bookings')
            *app.get('/bookings/:id')
            *app.post('bookings')
            *app.patch('/bookings/id')
            *app.delete('bookings/:id') 
        */

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



        app.post('/bookings', async(req, res) =>{
            const booking = req.body;
            console.log(booking)
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
            res.send(result);
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