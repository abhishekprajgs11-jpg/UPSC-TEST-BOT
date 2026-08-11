const { Telegraf, Markup } = require('telegraf');
const mongoose = require('mongoose');
const TestSeries = require('./models/TestSeries');
const AdminState = require('./models/AdminState');
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = process.env.ADMIN_ID;

const DEFAULT_COACHINGS = [
    "VISION IAS", "VAJIRAM & RAVI POWERUP TEST", "FORUM IAS", 
    "FORUM SFG LEVEL 01", "FORUM IAS SFG LEVEL 02", "PW SRIJAN", 
    "VISION IAS MINI TEST", "VAJIRAM CAMP"
];

const connectDB = async () => {
    if (mongoose.connection.readyState >= 1) return;
    try {
        await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 5000 
        });
        console.log("MongoDB Connected");
    } catch (error) {
        console.error("MongoDB Connection Error:", error);
        throw error;
    }
};

bot.use(async (ctx, next) => {
    try {
        await connectDB();
        return next();
    } catch (err) {
        if (ctx.chat) {
            await ctx.reply("Database is temporarily unavailable. Please make sure MongoDB Network Access is set to 0.0.0.0/0.");
        }
    }
});

// -----------------------------------------------------
// USER COMMANDS
// -----------------------------------------------------

bot.start(async (ctx) => {
    const welcomeMessage = `🎯 **WELCOME TO UPSC CSE TEST SERIES** 🇮🇳\n\n🔥 **Your UPSC Preparation. Your Test. Your Progress.**\n\nWelcome, Aspirant! 👋\nThis bot is designed to help you **practice, evaluate & improve** your UPSC CSE preparation with carefully curated **Test Series & Practice Questions**.\n\n📚 **What you can expect here:**\n• 📝 UPSC CSE Prelims-focused Tests\n• 🎯 High-quality MCQs & Most Important Questions\n• 🔥 Subject-wise & Full-Length Tests\n• 📊 Practice to improve accuracy & speed\n• 🧠 Questions designed for serious UPSC aspirants\n\n🚀 **Your preparation becomes stronger with every test you attempt.**\n\n👉 **Select a Test Series below and start your preparation!**\n\n💬 **For any query, issue, or assistance:**\nContact **@Shrma\\_Ishuu\\_bot**\n\n🇮🇳 **Prepare Smart. Practice More. Crack UPSC CSE.** 💯`;

    const years = await TestSeries.distinct('year');
    
    if (years.length === 0) {
        return ctx.reply(welcomeMessage + "\n\n⚠️ Currently, there are no tests available. Admin will upload them soon.", { parse_mode: 'Markdown' });
    }

    const buttons = years.map(y => Markup.button.callback(y, `year_${y}`));
    const keyboard = Markup.inlineKeyboard(buttons, { columns: 2 });
    
    ctx.reply(welcomeMessage, { parse_mode: 'Markdown', reply_markup: keyboard.reply_markup });
});

bot.help((ctx) => {
    ctx.reply("This bot provides UPSC CSE Test Series.\n- Type /start to browse tests.\n- Use the buttons to select Year, Coaching, and Test Code to download PDFs.");
});

// -----------------------------------------------------
// ADMIN WIZARD (/add, /cancel)
// -----------------------------------------------------

bot.command('cancel', async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return;
    await AdminState.findOneAndDelete({ adminId: ADMIN_ID });
    ctx.reply("❌ Operation cancelled.");
});

bot.command('add', async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) {
        return ctx.reply("You are not authorized to use this command.");
    }

    await AdminState.findOneAndUpdate(
        { adminId: ADMIN_ID }, 
        { step: 'CHOOSE_TYPE', type: null, questionPdfId: null, solutionPdfId: null, coaching: null, year: null, testCode: null },
        { upsert: true }
    );

    const keyboard = Markup.inlineKeyboard([
        Markup.button.callback("📄 Only Test", "add_type_TEST_ONLY"),
        Markup.button.callback("📄+💡 Test + Solution", "add_type_TEST_AND_SOL")
    ]);
    
    ctx.reply("What do you want to add? (Use /cancel to stop)", keyboard);
});

// Step 1: Handle Type Selection
bot.action(/add_type_(.+)/, async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return;
    const type = ctx.match[1];
    
    await AdminState.findOneAndUpdate({ adminId: ADMIN_ID }, { type, step: 'WAITING_TEST_PDF' });
    ctx.editMessageText(`You selected: ${type === 'TEST_ONLY' ? 'Only Test' : 'Test + Solution'}\n\nPlease send/upload the **TEST PDF** now. (Use /cancel to stop)`, { parse_mode: 'Markdown' });
});

// Helper for Step 3: Coaching Selection
const sendCoachingOptions = async (ctx, adminState) => {
    // Get unique coachings from DB + default list
    let dbCoachings = await TestSeries.distinct('coaching');
    let allCoachings = [...new Set([...DEFAULT_COACHINGS, ...dbCoachings])];
    
    let buttons = allCoachings.map(c => Markup.button.callback(c.substring(0, 30), `add_coach_${c}`));
    buttons.push(Markup.button.callback("➕ OTHERS", "add_coach_OTHERS"));
    
    const keyboard = Markup.inlineKeyboard(buttons, { columns: 2 });
    
    await AdminState.findOneAndUpdate({ adminId: ADMIN_ID }, { step: 'CHOOSE_COACHING' });
    
    const msg = `PDFs received!\nNow, select the **Coaching** for this test:`;
    if (ctx.callbackQuery) {
        await ctx.editMessageText(msg, { parse_mode: 'Markdown', reply_markup: keyboard.reply_markup });
    } else {
        await ctx.reply(msg, { parse_mode: 'Markdown', reply_markup: keyboard.reply_markup });
    }
};

// Step 2 & 3: Handle Documents (PDFs)
bot.on('document', async (ctx, next) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return next();
    
    const state = await AdminState.findOne({ adminId: ADMIN_ID });
    if (!state) return next();

    const fileId = ctx.message.document.file_id;

    if (state.step === 'WAITING_TEST_PDF') {
        state.questionPdfId = fileId;
        if (state.type === 'TEST_ONLY') {
            await state.save();
            await sendCoachingOptions(ctx, state);
        } else {
            state.step = 'WAITING_SOL_PDF';
            await state.save();
            ctx.reply("Test PDF received ✅\nNow, please send/upload the **SOLUTION PDF**.");
        }
    } else if (state.step === 'WAITING_SOL_PDF') {
        state.solutionPdfId = fileId;
        await state.save();
        await sendCoachingOptions(ctx, state);
    } else {
        return next();
    }
});

// Step 4: Handle Coaching Selection
bot.action(/add_coach_(.+)/, async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return;
    const coaching = ctx.match[1];

    if (coaching === 'OTHERS') {
        await AdminState.findOneAndUpdate({ adminId: ADMIN_ID }, { step: 'WAITING_CUSTOM_COACHING' });
        ctx.editMessageText("Please type the name of the new Coaching:");
    } else {
        await AdminState.findOneAndUpdate({ adminId: ADMIN_ID }, { coaching, step: 'CHOOSE_YEAR' });
        sendYearOptions(ctx);
    }
});

// Helper for Step 5: Year Selection
const sendYearOptions = (ctx) => {
    const keyboard = Markup.inlineKeyboard([
        Markup.button.callback("2025", "add_year_2025"),
        Markup.button.callback("2026", "add_year_2026"),
        Markup.button.callback("2027", "add_year_2027"),
        Markup.button.callback("2028", "add_year_2028")
    ], { columns: 2 });
    
    const msg = "Select the **Year** or type it manually:";
    if (ctx.callbackQuery) {
        ctx.editMessageText(msg, { parse_mode: 'Markdown', reply_markup: keyboard.reply_markup });
    } else {
        ctx.reply(msg, { parse_mode: 'Markdown', reply_markup: keyboard.reply_markup });
    }
};

bot.action(/add_year_(.+)/, async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return;
    const year = ctx.match[1];
    await AdminState.findOneAndUpdate({ adminId: ADMIN_ID }, { year, step: 'WAITING_TEST_CODE' });
    ctx.editMessageText(`Year selected: ${year}\n\nPlease type the **Test Code** (e.g., 1234, FLT-1):`, { parse_mode: 'Markdown' });
});

// Handle Text Inputs (Custom Coaching, Custom Year, Test Code)
bot.on('text', async (ctx, next) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return next();
    
    const state = await AdminState.findOne({ adminId: ADMIN_ID });
    if (!state) return next();

    const text = ctx.message.text.trim();

    if (state.step === 'WAITING_CUSTOM_COACHING') {
        state.coaching = text;
        state.step = 'CHOOSE_YEAR';
        await state.save();
        sendYearOptions(ctx);
    } else if (state.step === 'CHOOSE_YEAR') {
        state.year = text;
        state.step = 'WAITING_TEST_CODE';
        await state.save();
        ctx.reply(`Year set to: ${text}\n\nPlease type the **Test Code** (e.g., 1234, FLT-1):`, { parse_mode: 'Markdown' });
    } else if (state.step === 'WAITING_TEST_CODE') {
        state.testCode = text;
        
        // Final Save to TestSeries
        try {
            let test = await TestSeries.findOne({ year: state.year, coaching: state.coaching, testCode: state.testCode });
            if (!test) {
                test = new TestSeries({ year: state.year, coaching: state.coaching, testCode: state.testCode, questionPdfId: state.questionPdfId });
            }
            if (state.questionPdfId) test.questionPdfId = state.questionPdfId;
            if (state.solutionPdfId) test.solutionPdfId = state.solutionPdfId;
            await test.save();
            
            ctx.reply(`✅ **Successfully saved!**\n\n📌 **Coaching:** ${state.coaching}\n📅 **Year:** ${state.year}\n📝 **Test Code:** ${state.testCode}\n\nIt is now available for users!`, { parse_mode: 'Markdown' });
        } catch (e) {
            console.error(e);
            ctx.reply("❌ Error saving to database.");
        }
        
        // Clear state
        await AdminState.findOneAndDelete({ adminId: ADMIN_ID });
    } else if (state.step === 'EDIT_WAITING_NEW_NAME') {
        const newName = text;
        try {
            if (state.targetType === 'YEAR') {
                await TestSeries.updateMany({ year: state.oldName }, { $set: { year: newName } });
                ctx.reply(`✅ Successfully renamed Year from **${state.oldName}** to **${newName}**!`, { parse_mode: 'Markdown' });
            } else if (state.targetType === 'COACHING') {
                await TestSeries.updateMany({ year: state.year, coaching: state.oldName }, { $set: { coaching: newName } });
                ctx.reply(`✅ Successfully renamed Coaching from **${state.oldName}** to **${newName}** in Year ${state.year}!`, { parse_mode: 'Markdown' });
            } else if (state.targetType === 'TEST') {
                await TestSeries.updateOne({ year: state.year, coaching: state.coaching, testCode: state.oldName }, { $set: { testCode: newName } });
                ctx.reply(`✅ Successfully renamed Test Code from **${state.oldName}** to **${newName}**!`, { parse_mode: 'Markdown' });
            }
        } catch (e) {
            console.error(e);
            ctx.reply("❌ Error updating database.");
        }
        await AdminState.findOneAndDelete({ adminId: ADMIN_ID });
    } else {
        return next();
    }
});


// -----------------------------------------------------
// USER BROWSING FLOW (Unchanged mostly)
// -----------------------------------------------------

bot.action(/year_(.+)/, async (ctx) => {
    const year = ctx.match[1];
    const coachings = await TestSeries.distinct('coaching', { year });
    
    const buttons = coachings.map(c => Markup.button.callback(c.substring(0, 30), `coaching_${year}_${c}`));
    buttons.push(Markup.button.callback("⬅️ Back to Years", "back_start"));
    const keyboard = Markup.inlineKeyboard(buttons, { columns: 1 });
    
    ctx.editMessageText(`📅 **Selected Year:** ${year}\n\n👉 Now select a Coaching:`, { parse_mode: 'Markdown', reply_markup: keyboard.reply_markup });
});

bot.action(/coaching_(.+)_(.+)/, async (ctx) => {
    const year = ctx.match[1];
    const coaching = ctx.match[2];
    
    const tests = await TestSeries.find({ year, coaching });
    
    const buttons = tests.map(t => Markup.button.callback(`Test: ${t.testCode}`, `test_${t._id}`));
    buttons.push(Markup.button.callback("⬅️ Back to Coachings", `year_${year}`));
    const keyboard = Markup.inlineKeyboard(buttons, { columns: 2 });
    
    ctx.editMessageText(`📅 **Year:** ${year}\n📌 **Coaching:** ${coaching}\n\n👉 Select a Test Code:`, { parse_mode: 'Markdown', reply_markup: keyboard.reply_markup });
});

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

bot.action("back_start", async (ctx) => {
    const years = await TestSeries.distinct('year');
    const buttons = years.map(y => Markup.button.callback(y, `year_${y}`));
    const keyboard = Markup.inlineKeyboard(buttons, { columns: 2 });
    
    ctx.editMessageText("👉 **Select a Test Series Year below:**", { parse_mode: 'Markdown', reply_markup: keyboard.reply_markup });
});

require('./adminCommands')(bot);

module.exports = bot;
