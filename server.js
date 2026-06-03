require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 5000;

// Middlewares - Base64 images aur heavy JSON handle karne ke liye limits
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// 🔥 OPTIMIZED MONGODB ATLAS CONNECTION STRING (SRV FORMAT) - Configurable via .env
const mongoURI = process.env.MONGODB_URI || "mongodb+srv://muhammadanasfusst_db_user:anasMONGO114119@cluster0.sua3hl8.mongodb.net/ohms_database?retryWrites=true&w=majority";

mongoose.connect(mongoURI, {
    serverSelectionTimeoutMS: 30000, // 30 Seconds timeout fallback
    connectTimeoutMS: 30000,
})
.then(() => console.log(`🚀 MongoDB Atlas connected successfully! Database: ${mongoose.connection.name}`))
.catch(err => {
    console.error("❌ MongoDB connection error:", err.message);
    console.log("👉 Tip: Local connection k liye local URI use karein, ya check karein ke Atlas Network Access enabled hai (IP 0.0.0.0/0).");
});

// --- Database Schemas & Models ---

// User Schema
const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true }
}, { timestamps: true });

const User = mongoose.model('User', UserSchema);

// Member Schema
const MemberSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },
    cvData: { type: String, required: true }, // Base64 PDF Data
    cvName: { type: String, default: "CV.pdf" }
});

// Project Schema
const ProjectSchema = new mongoose.Schema({
    id: { type: String, required: true }, // Custom user-facing ID
    userEmail: { type: String, required: true },
    userName: { type: String },
    title: { type: String, required: true },
    category: { type: String, required: true },
    abstract: { type: String, required: true },
    supervisor: { type: String, required: true },
    image: { type: String, required: true }, // Base64 Image String
    status: { type: String, default: "Pending" },
    members: [MemberSchema]
}, { timestamps: true });

const Project = mongoose.model('Project', ProjectSchema);

// --- API Routes ---

// --- User Authentication APIs ---

// 1. User Signup API
app.post('/api/auth/signup', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password) {
            return res.status(400).json({ success: false, message: "All registration fields are required" });
        }
        
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ success: false, message: "This email account already exists!" });
        }

        const newUser = new User({ name, email, password });
        await newUser.save();
        res.status(201).json({ success: true, message: "Registration completed successfully!" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server error during registration", error: error.message });
    }
});

// 2. User Login API
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ success: false, message: "Email and password are required" });
        }

        const user = await User.findOne({ email, password });
        if (!user) {
            return res.status(400).json({ success: false, message: "Invalid Email or Password credentials!" });
        }

        res.status(200).json({ success: true, user: { name: user.name, email: user.email } });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server error during login", error: error.message });
    }
});

// --- Project Management APIs ---

// 3. New Project Register/Save karne ki API
app.post('/api/projects', async (req, res) => {
    try {
        const { id, userEmail, userName, title, category, abstract, supervisor, image, members } = req.body;
        
        const newProject = new Project({
            id,
            userEmail,
            userName,
            title,
            category,
            abstract: abstract || req.body.description, 
            supervisor,
            image,
            members
        });

        await newProject.save();
        res.status(201).json({ success: true, message: "Project saved to MongoDB successfully!", project: newProject });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server Error saving project", error: error.message });
    }
});

// 4. Saare Projects Dashboard ya Tables me lane ki API
app.get('/api/projects', async (req, res) => {
    try {
        const projects = await Project.find().sort({ createdAt: -1 });
        res.status(200).json(projects);
    } catch (error) {
        res.status(500).json({ success: false, message: "Server Error fetching projects", error: error.message });
    }
});

// 5. Status Update karne ki API (Approve / Reject) by Custom ID or MongoDB _id
app.put('/api/projects/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        const id = req.params.id;
        let updatedProject;
        if (id.startsWith('PROJ-')) {
            updatedProject = await Project.findOneAndUpdate({ id: id }, { status }, { new: true });
        } else {
            updatedProject = await Project.findByIdAndUpdate(id, { status }, { new: true });
        }
        res.status(200).json({ success: true, project: updatedProject });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error updating status", error: error.message });
    }
});

// 6. Project Delete karne ki API by Custom ID or MongoDB _id
app.delete('/api/projects/:id', async (req, res) => {
    try {
        const id = req.params.id;
        if (id.startsWith('PROJ-')) {
            await Project.findOneAndDelete({ id: id });
        } else {
            await Project.findByIdAndDelete(id);
        }
        res.status(200).json({ success: true, message: "Project permanently erased from MongoDB" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error deleting project", error: error.message });
    }
});

// 7. Project Edit/Update karne ki API (title, category, description, image, members)
app.put('/api/projects/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const { title, category, abstract, supervisor, image, members } = req.body;

        const updateData = { title, category, supervisor, abstract };

        // Only update image if a new one was provided
        if (image && image.length > 100) {
            updateData.image = image;
        }

        // Update members if provided
        if (members && members.length > 0) {
            updateData.members = members;
        }

        let updatedProject;
        if (id.startsWith('PROJ-')) {
            updatedProject = await Project.findOneAndUpdate(
                { id: id },
                { $set: updateData },
                { new: true }
            );
        } else {
            updatedProject = await Project.findByIdAndUpdate(
                id,
                { $set: updateData },
                { new: true }
            );
        }

        if (!updatedProject) {
            return res.status(404).json({ success: false, message: "Project not found" });
        }

        res.status(200).json({ success: true, message: "Project updated successfully!", project: updatedProject });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error updating project", error: error.message });
    }
});


// Server Start
app.listen(PORT, () => {
    console.log(`📡 Backend Server listening seamlessly on http://localhost:${PORT}`);
});