// // mongo.js
// const mongoose = require('mongoose');

// const connectDb= async () => {
//   try {
//     await mongoose.connect(process.env.MONGO_URI);
//     console.log('✅ MongoDB connected');
//   } catch (err) {
//     console.error('❌ MongoDB connection failed:', err.message);
//     process.exit(1);
//   }
// };

// module.exports = connectDb

// module.exports = connectMongo;
const mongoose  = require('mongoose')
/*
Db Connection
*/
const connectMongo = async () => {
    try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ MongoDB connected');
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  }
}
 
 
module.exports = connectMongo
 