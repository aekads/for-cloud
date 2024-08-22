const express = require("express");
const session = require("express-session");
const sessionConfig = require("./src/middlewares/sessionConfig");
const path = require("path");
const cookieParser = require("cookie-parser");
require("dotenv").config();
const dashboardRoutes = require("./src/routes/dashboardRoutes");
const loginRoutes = require("./src/routes/loginRoutes");
const flash = require('connect-flash');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const { Sequelize, DataTypes } = require('sequelize');
const cloudinary = require('./src/config/cloudinaryConfig');
const app = express();
const api = require('./src/controllers/api.controller');
const moment = require('moment-timezone');
const axios = require('axios');

const https = require('https');

const { S3Client } = require('@aws-sdk/client-s3');
const multer = require('multer');
const multerS3 = require('multer-s3');
const { Pool } = require('pg');
const AWS = require('aws-sdk');


// SSL/TLS configuration: Use a more secure protocol version
const agent = new https.Agent({
  rejectUnauthorized: false, // Disable SSL verification (not recommended for production)
  minVersion: 'TLSv1.2', // Ensure at least TLS 1.2 is used
  maxVersion: 'TLSv1.3', // Optionally limit to TLS 1.3
});




const s3 = new S3Client({
  region: 'auto',
  endpoint: 'https://928ca554d378c1728d9f2f9c995bf0c1.r2.dev',
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_ACCESS_KEY_ID,
    secretAccessKey: process.env.CLOUDFLARE_SECRET_ACCESS_KEY
  },
  requestHandler: new https.Agent(agent)
});
















// Initialize PostgreSQL client
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});


// Setup multer with Cloudflare R2
const upload = multer({
  storage: multerS3({
    s3: s3,
    bucket: process.env.R2_BUCKET,
    acl: 'public-read',
    key: function (req, file, cb) {
      cb(null, Date.now().toString() + '-' + file.originalname);
    },
  }),
});
// Home route to display the upload form
app.get('/index', (req, res) => {
  res.render('index1');
});

app.post('/upload', upload.single('file'), async (req, res) => {
  const fileUrl = req.file.location;
  const originalName = req.file.originalname;
  const size = req.file.size;

  try {
    const client = await pool.connect();
    const result = await client.query(
      'INSERT INTO files(url, original_name, size) VALUES($1, $2, $3) RETURNING *',
      [fileUrl, originalName, size]
    );
    client.release();

    res.redirect('Dashboard/Library');
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to upload file. Please try again.',
      error: err.message,
    });
  }
});


// Route to display all uploaded videos
app.get('/videos', async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT * FROM files');
    client.release();

    res.render('videos', { videos: result.rows });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});


async function getTotalBucketSize(bucketName) {
  let totalSize = 0;
  let continuationToken = null;

  do {
    const params = {
      Bucket: bucketName,
      ContinuationToken: continuationToken,
    };

    const response = await s3aws.listObjectsV2(params).promise();
    
    response.Contents.forEach(object => {
      totalSize += object.Size;
    });

    continuationToken = response.IsTruncated ? response.NextContinuationToken : null;
  } while (continuationToken);

  return totalSize;
}
// Express route to get total bucket size
app.get('/bucket-size', async (req, res) => {
  const bucketName = 'dhvanil';

  try {
    const totalSize = await getTotalBucketSize(bucketName);
    res.json({
      success: true,
      bucketName: bucketName,
      totalSize: totalSize, // Size in bytes
      totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2), // Size in MB
    
    });
  } catch (err) {
    console.error('Error calculating bucket size:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to calculate bucket size',
      error: err.message,
    });
  }
});

// Database setup
const sequelize = new Sequelize('dbzvtfeophlfnr', 'u3m7grklvtlo6', 'AekAds@24', {
  host: '35.209.89.182',
  dialect: 'postgres'
});

// Define models
const User = sequelize.define('User', {
  name: DataTypes.STRING,
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  role: {
    type: DataTypes.ENUM,
    values: ['admin', 'editor', 'viewer'],
    allowNull: false,
  },
});
const OTP = sequelize.define('OTP', {
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  otp: {
    type: DataTypes.STRING,
    allowNull: false
  }
});

const Log = sequelize.define('Log', {
  action: {
    type: DataTypes.STRING,
    allowNull: false
  },
  message: {
    type: DataTypes.STRING,
    allowNull: true
  },
  ip: {
    type: DataTypes.STRING,
    allowNull: false
  }
});

const Log2 = sequelize.define('Log2', {
  action: {
    type: DataTypes.STRING,
    allowNull: false
  },
  message: {
    type: DataTypes.STRING,
    allowNull: true
  },
  ip: {
    type: DataTypes.STRING,
    allowNull: false
  }
});


// Function to fetch external IP
const getExternalIP = async () => {
  try {
    const response = await axios.get('https://api.ipify.org?format=json');
    return response.data.ip;
  } catch (error) {
    console.error('Error fetching external IP:', error);
    return 'Unknown IP';
  }
};

// Middleware for logging actions
const logAction = async (req, action, message) => {
  const ip = await getExternalIP();
  await Log.create({ action, message, ip });
};


const logAction2 = async (req, action, message) => {
  const ip = await getExternalIP();
  await Log2.create({ action, message, ip });
};


// Express middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));
app.use(session(sessionConfig));
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({ extended: false }));
app.use(flash());

app.use((req, res, next) => {
  res.locals.success_msg = req.flash('success_msg');
  res.locals.error_msg = req.flash('error_msg');
  res.locals.logAction = logAction;
  next();
});

// Routes
app.use("/Dashboard", dashboardRoutes.router);

app.get("/", (req, res) => {
  res.render("Login", { message: null });      
});

app.get('/alldata', api.getAllScreensAllData);
app.get('/livedata', api.getAllScreensAllData);

app.get('/register', (req, res) => {
  res.render('register');
});
app.post('/register', async (req, res) => {
  const { name, email, password, role } = req.body;
  const allowedRoles = ['admin', 'editor', 'viewer'];

  // Check if the role is one of the allowed roles
  if (!allowedRoles.includes(role)) {
    req.flash('error_msg', 'Invalid role selected.');
    return res.redirect('/register');
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  await User.create({ name, email, password: hashedPassword, role });

  // Log the registration action
  await logAction(req, 'register', 'User registered');
  await logAction2(req, 'register', 'User registered');


  res.redirect('/Dashboard/Teams/Addmember');
});

app.get('/login', (req, res) => {
  res.render('Login');
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ where: { email } });
  if (user && await bcrypt.compare(password, user.password)) {
    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await OTP.create({ userId: user.id, otp });
    req.session.otp = otp;
    req.session.user = user;

    // Send OTP via email
    let transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: 'aekads.otp@gmail.com',
        pass: 'ntkp cloo wjnx atep'
      }
    });

    let mailOptions = {
      from: 'aekads.otp@gmail.com',
      to: user.email,
      subject: 'Your login OTP Code',
      text: `Your login OTP code is ${otp}`
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.log(error);
      } else {
        console.log('Email sent: ' + info.response);
      }
    });

    // Log the login action
    await logAction(req, 'login', 'User logged in');

    res.redirect('/verify-otp');
  } else {
    req.flash('error_msg', 'Invalid email or password. Please check and try again.');
    res.redirect('/');
  }
});

app.get('/verify-otp', (req, res) => {
  res.render('verify-otp');
});

app.post('/verify-otp', async (req, res) => {
  const { otp } = req.body;
  const savedOtp = await OTP.findOne({ where: { userId: req.session.user.id, otp } });
  
  if (savedOtp) {
    const otpCreationTime = savedOtp.createdAt;
    const currentTime = new Date();
    const timeDifference = (currentTime - otpCreationTime) / 1000; // Time difference in seconds

    if (timeDifference > 60) {
      await OTP.destroy({ where: { id: savedOtp.id } });
      req.flash('error_msg', 'OTP has expired. Please request a new one.');
      console.log('OTP expired');
      res.redirect('/verify-otp');
    } else {
      await OTP.destroy({ where: { id: savedOtp.id } });
    
      res.redirect('/Dashboard');
    }
  } else {
    req.flash('error_msg', 'Invalid OTP. Please check and try again.');
    res.redirect('/verify-otp');
  }
});

app.post('/resend-otp', async (req, res) => {
  const user = req.session.user;
  if (user) {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await OTP.create({ userId: user.id, otp });

    let transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: 'aekads.otp@gmail.com',
        pass: 'ntkp cloo wjnx atep'
      }
    });

    let mailOptions = {
      from: 'aekads.otp@gmail.com',
      to: user.email,
      subject: 'Your login OTP Code',
      text: `Your login OTP code is ${otp}`
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.log(error);
        res.json({ success: false });
      } else {
        console.log('Email sent: ' + info.response);
        res.json({ success: true });
      }
    });
  } else {
    res.json({ success: false });
  }
});

// Function to fetch Cloudinary storage data
const getCloudinaryStorageData = async () => {
  try {
    const result = await cloudinary.api.usage();
    console.log('Cloudinary Storage Data:', result); // Debug log
    return result;
  } catch (error) {
    console.error('Error fetching Cloudinary storage data:', error);
  }
};

app.get('/api/cloudinary-storage', async (req, res) => {
  const data = await getCloudinaryStorageData();
  res.json(data);
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

app.get('/logs', dashboardRoutes.isAuthenticated, async (req, res) => {
  try {
    const logs = await Log.findAll({
      order: [['createdAt', 'DESC']]
    });        

    // Convert timestamps to IST
    const logsWithIST = logs.map(log => ({
      ...log.dataValues,
      createdAt: moment(log.createdAt).tz('Asia/Kolkata').format('HH:mm:ss DD-MM-YYYY')
    }));

    res.render('logs', { logs: logsWithIST });
  } catch (error) { 
    console.error('Error fetching logs:', error);
    req.flash('error_msg', 'Error fetching logs. Please try again.');
    res.redirect('/Dashboard');
  }
});


// Route to display all users
app.get('/admin/users',dashboardRoutes.isAuthenticated, async (req, res) => {
  const user = req.session.user;

 
  try {
    const users = await User.findAll();
    res.render('admin-users', { users });
  } catch (error) {
    console.error(error);
    req.flash('error_msg', 'An error occurred while fetching users.');
    res.redirect('/');
  }
});

// Route to get the edit user form
app.get('/admin/users/:id/edit', async (req, res) => {
  const user = req.session.user;
  const userId = req.params.id;

 
  try {
    const userToEdit = await User.findOne({ where: { id: userId } });

    if (!userToEdit) {
      req.flash('error_msg', 'User not found.');
      return res.redirect('/admin/users');
    }

    res.render('edit-user', { user: userToEdit });
  } catch (error) {
    console.error(error);
    req.flash('error_msg', 'An error occurred while fetching the user.');
    res.redirect('/admin/users');
  }
});

// Route to update a user's profile
app.post('/admin/users/:id/edit', async (req, res) => {
  const { name, email, role, currentPassword, newPassword, confirmNewPassword } = req.body;
  const allowedRoles = ['admin', 'editor', 'viewer'];
  const userId = req.params.id;

  // Check if the role is one of the allowed roles
  if (!allowedRoles.includes(role)) {
    req.flash('error_msg', 'Invalid role selected.');
    return res.redirect(`/admin/users/${userId}/edit`);
  }

  try {
    const user = await User.findOne({ where: { id: userId } });

    if (!user) {
      req.flash('error_msg', 'User not found.');
      return res.redirect('/admin/users');
    }

    // Update user details
    user.name = name;
    user.email = email;
    user.role = role;

    if (currentPassword || newPassword || confirmNewPassword) {
      if (!currentPassword || !newPassword || !confirmNewPassword) {
        req.flash('error_msg', 'Please fill in all password fields.');
        return res.redirect(`/admin/users/${userId}/edit`);
      }

      const passwordMatch = await bcrypt.compare(currentPassword, user.password);
      if (!passwordMatch) {
        req.flash('error_msg', 'Current password is incorrect.');
        return res.redirect(`/admin/users/${userId}/edit`);
      }

      if (newPassword !== confirmNewPassword) {
        req.flash('error_msg', 'New passwords do not match.');
        return res.redirect(`/admin/users/${userId}/edit`);
      }

      user.password = await bcrypt.hash(newPassword, 10);
    }

    await user.save();
    await logAction(req, 'Profile Edit', 'User Profile edited');
    await logAction2(req, 'edit Profile', 'User edit');
    req.flash('success_msg', 'User updated successfully.');
    res.redirect('/admin/users');
  } catch (error) {
    console.error(error);
    req.flash('error_msg', 'An error occurred while updating the user.');
    res.redirect(`/admin/users/${userId}/edit`);
  }
});


// Route to delete a user
app.post('/admin/users/:id/delete', async (req, res) => {
  const user = req.session.user;
  const userId = req.params.id;


  try {
    const userToDelete = await User.findOne({ where: { id: userId } });

    if (!userToDelete) {
      req.flash('error_msg', 'User not found.');
      return res.redirect('/admin/users');
    }

    // Delete the user
    await userToDelete.destroy();
    req.flash('success_msg', 'User deleted successfully.');
    await logAction(req, 'Profile Delete', 'User Profile deleted');
    await logAction2(req, 'Profile Delete', 'User Profile deleted');
    res.redirect('/admin/users');
  } catch (error) {
    console.error(error);
    req.flash('error_msg', 'An error occurred while deleting the user.');
    res.redirect('/admin/users');
  }
});
app.get('/admin/logs', dashboardRoutes.isAuthenticated, async (req, res) => {
  try {
    const logs = await Log2.findAll({
      order: [['createdAt', 'DESC']]
    });

    // Convert timestamps to IST
    const logsWithIST = logs.map(log => ({
      ...log.dataValues,
      createdAt: moment(log.createdAt).tz('Asia/Kolkata').format('HH:mm:ss DD-MM-YYYY')
    }));

    res.render('log', { logs: logsWithIST });
  } catch (error) {
    console.error('Error fetching logs:', error);
    req.flash('error_msg', 'Error fetching logs. Please try again.');
    res.redirect('/Dashboard');
  }
});



// Sync database and start server
sequelize.sync().then(() => {
  app.listen(3000, () => {
    console.log('Server is running on port 3000');
  });
});
 
