const { Telegraf, Markup } = require('telegraf');
const mongoose = require('mongoose');
const TestSeries = require('./models/TestSeries');
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = process.env.ADMIN_ID; // Your Telegram User ID

// Connect to MongoDB
const connectDB = async () => {
    if (mongoose.connection.readyState >= 1) return;
    try {
        await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log("MongoDB Connected");
    } catch (error) {
        console.error("MongoDB Connection Error:", error);
    }
};

bot.use(async (ctx, next) => {
    await connectDB();
    return next();
});

// START COMMAND
bot.start(async (ctx) => {
    const years = await TestSeries.distinct('year');
    
    if (years.length === 0) {
        return ctx.reply("Welcome to UPSC CSE Test Series Bot! \n\nCurrently, there are no tests available. Admin will upload them soon.");
    }

    const buttons = years.map(y => Markup.button.callback(y, `year_${y}`));
    const keyboard = Markup.inlineKeyboard(buttons, { columns: 2 });
    
    ctx.reply("Welcome! Please select a Year:", keyboard);
});

// ADMIN UPLOAD HANDLER
bot.on('document', async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) {
        return ctx.reply("You are not authorized to upload tests.");
    }

    const caption = ctx.message.caption;
    if (!caption) {
        return ctx.reply("Please provide a caption in this format:\nYear, Coaching, TestCode, Type(Q/S)\nExample: 2026, Vision IAS, 1234, Q");
    }

    const parts = caption.split(',').map(s => s.trim());
    if (parts.length !== 4) {
        return ctx.reply("Invalid format. Use: Year, Coaching, TestCode, Type(Q/S)");
    }

    const [year, coaching, testCode, type] = parts;
    const isQuestion = type.toUpperCase() === 'Q';
    const isSolution = type.toUpperCase() === 'S';
    
    if (!isQuestion && !isSolution) {
        return ctx.reply("Type must be either Q (Question) or S (Solution)");
    }

    const fileId = ctx.message.document.file_id;

    try {
        let test = await TestSeries.findOne({ year, coaching, testCode });
        
        if (!test) {
            test = new TestSeries({ year, coaching, testCode, questionPdfId: isQuestion ? fileId : '' });
        }
        
        if (isQuestion) test.questionPdfId = fileId;
        if (isSolution) test.solutionPdfId = fileId;

        await test.save();
        ctx.reply(`✅ Successfully saved!\nYear: ${year}\nCoaching: ${coaching}\nTest Code: ${testCode}\nType: ${isQuestion ? 'Question' : 'Solution'}`);
    } catch (error) {
        console.error(error);
        ctx.reply("Error saving to database.");
    }
});

// YEAR SELECTION
bot.action(/year_(.+)/, async (ctx) => {
    const year = ctx.match[1];
    const coachings = await TestSeries.distinct('coaching', { year });
    
    const buttons = coachings.map(c => Markup.button.callback(c, `coaching_${year}_${c}`));
    // add back button
    buttons.push(Markup.button.callback("⬅️ Back", "back_start"));
    const keyboard = Markup.inlineKeyboard(buttons, { columns: 1 });
    
    ctx.editMessageText(`Selected Year: ${year}\nNow select a Coaching:`, keyboard);
});

// COACHING SELECTION
bot.action(/coaching_(.+)_(.+)/, async (ctx) => {
    const year = ctx.match[1];
    const coaching = ctx.match[2];
    
    const tests = await TestSeries.find({ year, coaching });
    
    const buttons = tests.map(t => Markup.button.callback(`Test: ${t.testCode}`, `test_${t._id}`));
    buttons.push(Markup.button.callback("⬅️ Back", `year_${year}`));
    const keyboard = Markup.inlineKeyboard(buttons, { columns: 2 });
    
    ctx.editMessageText(`Year: ${year}\nCoaching: ${coaching}\nSelect a Test Code:`, keyboard);
});

// TEST SELECTION (GET PDFS)
bot.action(/test_(.+)/, async (ctx) => {
    const testId = ctx.match[1];
    const test = await TestSeries.findById(testId);
    
    if (!test) return ctx.answerCbQuery("Test not found!");

    ctx.answerCbQuery("Sending PDFs...");
    
    if (test.questionPdfId) {
        await ctx.replyWithDocument(test.questionPdfId, { caption: `📚 ${test.coaching} - ${test.testCode} (Question)` });
    }
    
    if (test.solutionPdfId) {
        await ctx.replyWithDocument(test.solutionPdfId, { caption: `💡 ${test.coaching} - ${test.testCode} (Solution)` });
    }
});

// BACK TO START
bot.action("back_start", async (ctx) => {
    const years = await TestSeries.distinct('year');
    const buttons = years.map(y => Markup.button.callback(y, `year_${y}`));
    const keyboard = Markup.inlineKeyboard(buttons, { columns: 2 });
    
    ctx.editMessageText("Welcome! Please select a Year:", keyboard);
});

// Export for Vercel Serverless
module.exports = bot;
