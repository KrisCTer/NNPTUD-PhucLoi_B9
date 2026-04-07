let express = require('express');
let router = express.Router();
let messageModel = require('../schemas/message');
let { checkLogin } = require('../utils/authHandler');
let { uploadFile } = require('../utils/uploadHandler');

// GET "/" - lay message cuoi cung cua moi user ma user hien tai nhan tin
router.get('/', checkLogin, async function (req, res, next) {
    try {
        let currentUserId = req.user._id;
        let messages = await messageModel.aggregate([
            {
                $match: {
                    $or: [
                        { from: currentUserId },
                        { to: currentUserId }
                    ]
                }
            },
            {
                $sort: { createdAt: -1 }
            },
            {
                $addFields: {
                    otherUser: {
                        $cond: {
                            if: { $eq: ["$from", currentUserId] },
                            then: "$to",
                            else: "$from"
                        }
                    }
                }
            },
            {
                $group: {
                    _id: "$otherUser",
                    lastMessage: { $first: "$$ROOT" }
                }
            },
            {
                $replaceRoot: { newRoot: "$lastMessage" }
            },
            {
                $sort: { createdAt: -1 }
            }
        ]);
        await messageModel.populate(messages, [
            { path: 'from', select: 'username fullName avatarUrl' },
            { path: 'to', select: 'username fullName avatarUrl' }
        ]);
        res.send(messages);
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
});

// GET "/:userID" - lay toan bo message giua user hien tai va userID
router.get('/:userID', checkLogin, async function (req, res, next) {
    try {
        let currentUserId = req.user._id;
        let otherUserId = req.params.userID;
        let messages = await messageModel.find({
            $or: [
                { from: currentUserId, to: otherUserId },
                { from: otherUserId, to: currentUserId }
            ]
        })
            .sort({ createdAt: 1 })
            .populate('from', 'username fullName avatarUrl')
            .populate('to', 'username fullName avatarUrl');
        res.send(messages);
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
});

// POST "/:userID" - gui message (text hoac file)
router.post('/:userID', checkLogin, uploadFile.single('file'), async function (req, res, next) {
    try {
        let currentUserId = req.user._id;
        let { to, text } = req.body;
        let toUserId = req.params.userID || to;

        if (!toUserId) {
            return res.status(400).send({ message: 'thieu userID nhan tin' });
        }

        let messageContent = {};

        if (req.file) {
            // Neu co file thi type la "file", text la path den file
            messageContent.type = "file";
            messageContent.text = req.file.path;
        } else {
            if (!text || !text.trim()) {
                return res.status(400).send({ message: 'noi dung text khong duoc rong' });
            }
            // Neu khong co file thi type la "text", text la noi dung gui
            messageContent.type = "text";
            messageContent.text = text;
        }

        let newMessage = new messageModel({
            from: currentUserId,
            to: toUserId,
            messageContent: messageContent
        });
        await newMessage.save();
        await newMessage.populate('from', 'username fullName avatarUrl');
        await newMessage.populate('to', 'username fullName avatarUrl');
        res.send(newMessage);
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
});

module.exports = router;
