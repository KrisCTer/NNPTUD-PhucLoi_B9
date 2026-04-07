const mongoose = require('mongoose');
const fs = require('fs');
const readline = require('readline');
const userModel = require('./schemas/users');
const roleModel = require('./schemas/roles');
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: "sandbox.smtp.mailtrap.io",
    port: 25,
    secure: false,
    auth: {
        user: "",
        pass: "",
    },
});

function generateRandomPassword(length = 16) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()';
    let password = '';
    for (let i = 0; i < length; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
}

async function startImport() {
    try {
        await mongoose.connect('mongodb://localhost:27017/NNPTUD_C5');
        console.log("Connected to MongoDB.");

        let userRole = await roleModel.findOne({ name: { $regex: /^user$/i } });
        if (!userRole) {
            console.log("User role not found! Creating 'USER' role...");
            userRole = new roleModel({ name: 'USER', description: 'User role' });
            await userRole.save();
        }

        const fileStream = fs.createReadStream('users.csv');
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });

        let isFirstLine = true;
        for await (const line of rl) {
            if (isFirstLine) {
                isFirstLine = false;
                continue; // skip header
            }

            const [username, email] = line.split(',');
            if (!username || !email) continue;

            const trimmedUsername = username.trim();
            const trimmedEmail = email.trim();

            const existingUser = await userModel.findOne({ $or: [{ username: trimmedUsername }, { email: trimmedEmail }] });
            if (existingUser) {
                console.log(`User ${trimmedUsername} or email ${trimmedEmail} already exists. Skipping.`);
                continue;
            }

            const password = generateRandomPassword(16);

            const newUser = new userModel({
                username: trimmedUsername,
                email: trimmedEmail,
                password: password,
                role: userRole._id,
                fullName: trimmedUsername,
                status: true
            });

            await newUser.save();
            console.log(`Imported user: ${trimmedUsername}`);

            // Send email
            try {
                await transporter.sendMail({
                    from: 'admin@system.com',
                    to: trimmedEmail,
                    subject: "Your new account password",
                    text: `Hello ${trimmedUsername},\n\nYour account has been created. Your password is: ${password}\n\nPlease keep it safe!`,
                });
                console.log(`Sent email to ${trimmedEmail}`);
            } catch (err) {
                console.log(`Failed to send email to ${trimmedEmail}:`, err.message);
            }
        }

        console.log("Import completed!");
        process.exit(0);

    } catch (error) {
        console.error("Error during import:", error);
        process.exit(1);
    }
}

startImport();
