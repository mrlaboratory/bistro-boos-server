const express = require('express');
const cors = require('cors');
const port = process.env.PORT || 3000
const app = express()
require('dotenv').config()
const stripe = require('stripe')(process.env.STRIPE_KEY);

var jwt = require('jsonwebtoken');

// middleware 
app.use(cors())
app.use(express.json())


const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization
  try {
    if (!authorization) {
      res.status(401).send({ error: true, message: 'Authorization field' })
    }
    // console.log(authorization);
    const token = authorization?.split(' ')[1]

    jwt.verify(token, process.env.ACCESS_TOKEN, (err, decoded) => {
      if (err) {
        console.log(err);
        return res.status(401).send({ error: true, message: 'Authorization field' })
      }
      // console.log('token verified')
      req.decoded = decoded
      next()
    })
  } catch (error) {
    console.log(error);
  }
}




const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.eq3m4nb.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const menuCollection = client.db('bistro').collection('menu')
    const reviewCollection = client.db('bistro').collection('review')
    const cartsCollection = client.db('bistro').collection('carts')
    const usersCollection = client.db('bistro').collection('users')
    const paymentsCollection = client.db('bistro').collection('payments')

    const verifyAdmin = async (req, res, next) => {
      const authorization = req.headers.authorization
      const userEmail = req.decoded.email
      const email = { email: userEmail }
      const role = await usersCollection.findOne(email)
      if (role.role !== 'Admin') {
        res.status(403).send({ error: true, message: 'Forbidden access, only for admin' })
      } else {
        next()
      }

    }

    



    app.post('/jwt', (req, res) => {
      try {
        const userInfo = req.body
        const token = jwt.sign(userInfo, process.env.ACCESS_TOKEN, { expiresIn: '1h' });
        res.send({ token })
      } catch (error) {
        console.log(error);
      }
    })

    app.get('/useritem/:email', verifyJWT, verifyAdmin, async (req, res) => {
      const userEmail = req.params.email
      let query = {email:'test'}
      if(userEmail){
        query = {email:userEmail} 
      }
      const result = await menuCollection.find(query).toArray()
      res.send(result)
    })

    app.delete('/useritem/:id', verifyJWT,  async (req, res) => {
      const id = req.params.id
      let query = {_id: new ObjectId(id)}
      const result = await menuCollection.deleteOne(query)
      res.send(result)
    })

    app.post('/menu', async (req, res) => {
      const data = req.body
      const result = await menuCollection.insertOne(data)
      res.send(result)
    })

    app.get('/menu', async (req, res) => {
      const result = await menuCollection.find().toArray()
      res.send(result)

    })

    app.get('/review', async (req, res) => {
      const result = await reviewCollection.find().toArray()
      res.send(result)

    })
    app.post('/carts', async (req, res) => {
      const itemInfo = req.body
      const result = await cartsCollection.insertOne(itemInfo)
      res.send(result)

    })
    app.get('/carts', verifyJWT,  async (req, res) => {
      const email = req.query.email
      const query = { email }
      const result = await cartsCollection.find(query).toArray()
      res.send(result)
    })
    app.delete('/carts/:id', async (req, res) => {
      const id = req.params.id
      const query = { _id: new ObjectId(id) }
      const result = await cartsCollection.deleteOne(query)
      res.send(result)
    })


    app.post('/users', async (req, res) => {
      const user = req.body
      const query = { email: user.email }
      const isExist = await usersCollection.findOne(query)
      if (isExist) {
        res.send({ message: 'user alredy exist' })
      } else {
        const result = await usersCollection.insertOne(user)
        res.send(result)
      }
    })

    app.post('/user/admin/:email', async (req, res) => {
      const email = req.params.email
      const r = req.body
      const role = r.role
      const query = { email }
      const Updateuser = {
        $set: {
          role
        }
      }
      const result = await usersCollection.updateOne(query, Updateuser)
      res.send(result)
    })


    app.get('/users', async (req, res) => {
      const result = await usersCollection.find().toArray()
      res.send(result)
    })

    app.get('/userRole/:email', async (req, res) => {
      const email = req.params.email
      const query = { email }
      const result = await usersCollection.findOne(query)
      if (result?.role) {
        res.send({ role: result?.role })
      } else {
        res.send({ role: 'User' })
      }

    })





    // create intent function 
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const amount = price*100
    
      // Create a PaymentIntent with the order amount and currency
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ['card']
        // automatic_payment_methods: {
        //   enabled: true,
        // },
      });
    
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });


  app.get('/admin-stats', verifyJWT, verifyAdmin, async (req, res) => {
     try {
      const users = await usersCollection.estimatedDocumentCount();
      const products = await menuCollection.estimatedDocumentCount();
      const orders = await paymentsCollection.estimatedDocumentCount()
      const payments = await paymentsCollection.find().toArray();
      const revenue = payments.reduce( ( sum, payment) => sum + payment.price, 0)
      res.send({
        revenue,
        users,
        products,
        orders
      })
     } catch (error) {
      console.log(error);
     }
    })
    app.post('/payments',async (req,res)=> {
      const info = req.body 
      const insertResult = await paymentsCollection.insertOne(info)
      const query = { _id: { $in: info.cartItems.map(id => new ObjectId(id)) } }
      const deleteResult = await cartsCollection.deleteMany(query)
      res.send({ insertResult, deleteResult });
    })


    app.get('/order-stats', async(req, res) =>{
      const pipeline = [
        {
          $lookup: {
            from: 'menu',
            localField: 'menuItems',
            foreignField: '_id',
            as: 'menuItemsData'
          }
        },
        {
          $unwind: '$menuItemsData'
        },
        {
          $group: {
            _id: '$menuItemsData.category',
            count: { $sum: 1 },
            total: { $sum: '$menuItemsData.price' }
          }
        },
        {
          $project: {
            category: '$_id',
            count: 1,
            total: { $round: ['$total', 2] },
            _id: 0
          }
        }
      ];

      const result = await paymentsCollection.aggregate(pipeline).toArray()
      res.send(result)

    })


    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);



app.get('/', (req, res) => {
  res.send('server is running')
})


app.listen(port, () => {
  console.log(`server is running on ${port}`)
})
