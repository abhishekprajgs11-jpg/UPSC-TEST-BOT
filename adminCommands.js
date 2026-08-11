const { Markup } = require('telegraf');
const TestSeries = require('./models/TestSeries');
const AdminState = require('./models/AdminState');

const ADMIN_ID = process.env.ADMIN_ID;

module.exports = (bot) => {
    // -----------------------------------------------------
    // DELETE WIZARD (/del)
    // -----------------------------------------------------
    bot.command('del', async (ctx) => {
        if (ctx.from.id.toString() !== ADMIN_ID) return;
        await AdminState.findOneAndUpdate(
            { adminId: ADMIN_ID }, 
            { step: 'DEL_CHOOSE_TYPE', operation: 'DEL', targetType: null, year: null, coaching: null, testCode: null },
            { upsert: true }
        );
        const keyboard = Markup.inlineKeyboard([
            Markup.button.callback("📅 Delete Year", "del_type_YEAR"),
            Markup.button.callback("📌 Delete Coaching", "del_type_COACHING"),
            Markup.button.callback("📝 Delete Test Code", "del_type_TEST")
        ], { columns: 1 });
        ctx.reply("🗑️ What do you want to delete? (Use /cancel to stop)", keyboard);
    });

    bot.action(/del_type_(.+)/, async (ctx) => {
        if (ctx.from.id.toString() !== ADMIN_ID) return;
        const targetType = ctx.match[1];
        await AdminState.findOneAndUpdate({ adminId: ADMIN_ID }, { targetType, step: 'DEL_CHOOSE_YEAR' });
        
        const years = await TestSeries.distinct('year');
        if (years.length === 0) return ctx.editMessageText("No data exists.");
        
        const buttons = years.map(y => Markup.button.callback(y, `del_year_${y}`));
        ctx.editMessageText("Select the **Year**:", { parse_mode: 'Markdown', reply_markup: Markup.inlineKeyboard(buttons, {columns: 2}).reply_markup });
    });

    bot.action(/del_year_(.+)/, async (ctx) => {
        if (ctx.from.id.toString() !== ADMIN_ID) return;
        const year = ctx.match[1];
        const state = await AdminState.findOneAndUpdate({ adminId: ADMIN_ID }, { year }, { new: true });
        
        if (state.targetType === 'YEAR') {
            const keyboard = Markup.inlineKeyboard([Markup.button.callback("✅ YES, DELETE", "del_confirm"), Markup.button.callback("❌ NO, CANCEL", "del_cancel")]);
            ctx.editMessageText(`⚠️ Are you sure you want to delete ALL tests of **${year}**?`, { parse_mode: 'Markdown', reply_markup: keyboard.reply_markup });
        } else {
            await AdminState.findOneAndUpdate({ adminId: ADMIN_ID }, { step: 'DEL_CHOOSE_COACHING' });
            const coachings = await TestSeries.distinct('coaching', { year });
            const buttons = coachings.map(c => Markup.button.callback(c.substring(0, 30), `del_coach_${c}`));
            ctx.editMessageText(`Selected Year: ${year}\nNow select the **Coaching**:`, { parse_mode: 'Markdown', reply_markup: Markup.inlineKeyboard(buttons, {columns: 1}).reply_markup });
        }
    });

    bot.action(/del_coach_(.+)/, async (ctx) => {
        if (ctx.from.id.toString() !== ADMIN_ID) return;
        const coaching = ctx.match[1];
        const state = await AdminState.findOneAndUpdate({ adminId: ADMIN_ID }, { coaching }, { new: true });
        
        if (state.targetType === 'COACHING') {
            const keyboard = Markup.inlineKeyboard([Markup.button.callback("✅ YES, DELETE", "del_confirm"), Markup.button.callback("❌ NO, CANCEL", "del_cancel")]);
            ctx.editMessageText(`⚠️ Are you sure you want to delete ALL tests of **${coaching}** in **${state.year}**?`, { parse_mode: 'Markdown', reply_markup: keyboard.reply_markup });
        } else {
            await AdminState.findOneAndUpdate({ adminId: ADMIN_ID }, { step: 'DEL_CHOOSE_TEST' });
            const tests = await TestSeries.find({ year: state.year, coaching });
            const buttons = tests.map(t => Markup.button.callback(`Test: ${t.testCode}`, `del_test_${t.testCode}`));
            ctx.editMessageText(`Year: ${state.year}\nCoaching: ${coaching}\nNow select the **Test Code**:`, { parse_mode: 'Markdown', reply_markup: Markup.inlineKeyboard(buttons, {columns: 2}).reply_markup });
        }
    });

    bot.action(/del_test_(.+)/, async (ctx) => {
        if (ctx.from.id.toString() !== ADMIN_ID) return;
        const testCode = ctx.match[1];
        await AdminState.findOneAndUpdate({ adminId: ADMIN_ID }, { testCode });
        
        const keyboard = Markup.inlineKeyboard([Markup.button.callback("✅ YES, DELETE", "del_confirm"), Markup.button.callback("❌ NO, CANCEL", "del_cancel")]);
        ctx.editMessageText(`⚠️ Are you sure you want to delete Test **${testCode}**?`, { parse_mode: 'Markdown', reply_markup: keyboard.reply_markup });
    });

    bot.action("del_confirm", async (ctx) => {
        if (ctx.from.id.toString() !== ADMIN_ID) return;
        const state = await AdminState.findOne({ adminId: ADMIN_ID });
        if (!state || state.operation !== 'DEL') return;

        try {
            if (state.targetType === 'YEAR') {
                await TestSeries.deleteMany({ year: state.year });
                ctx.editMessageText(`✅ Successfully deleted all tests for Year: ${state.year}`);
            } else if (state.targetType === 'COACHING') {
                await TestSeries.deleteMany({ year: state.year, coaching: state.coaching });
                ctx.editMessageText(`✅ Successfully deleted Coaching: ${state.coaching} from Year: ${state.year}`);
            } else if (state.targetType === 'TEST') {
                await TestSeries.deleteOne({ year: state.year, coaching: state.coaching, testCode: state.testCode });
                ctx.editMessageText(`✅ Successfully deleted Test Code: ${state.testCode}`);
            }
        } catch (e) {
            ctx.editMessageText("❌ Error deleting.");
        }
        await AdminState.findOneAndDelete({ adminId: ADMIN_ID });
    });

    bot.action("del_cancel", async (ctx) => {
        await AdminState.findOneAndDelete({ adminId: ADMIN_ID });
        ctx.editMessageText("❌ Deletion cancelled.");
    });


    // -----------------------------------------------------
    // EDIT WIZARD (/edit)
    // -----------------------------------------------------
    bot.command('edit', async (ctx) => {
        if (ctx.from.id.toString() !== ADMIN_ID) return;
        await AdminState.findOneAndUpdate(
            { adminId: ADMIN_ID }, 
            { step: 'EDIT_CHOOSE_TYPE', operation: 'EDIT', targetType: null, year: null, coaching: null, testCode: null },
            { upsert: true }
        );
        const keyboard = Markup.inlineKeyboard([
            Markup.button.callback("📅 Rename Year", "edit_type_YEAR"),
            Markup.button.callback("📌 Rename Coaching", "edit_type_COACHING"),
            Markup.button.callback("📝 Rename Test Code", "edit_type_TEST")
        ], { columns: 1 });
        ctx.reply("✏️ What do you want to edit? (Use /cancel to stop)", keyboard);
    });

    bot.action(/edit_type_(.+)/, async (ctx) => {
        if (ctx.from.id.toString() !== ADMIN_ID) return;
        const targetType = ctx.match[1];
        await AdminState.findOneAndUpdate({ adminId: ADMIN_ID }, { targetType, step: 'EDIT_CHOOSE_YEAR' });
        
        const years = await TestSeries.distinct('year');
        if (years.length === 0) return ctx.editMessageText("No data exists.");
        
        const buttons = years.map(y => Markup.button.callback(y, `edit_year_${y}`));
        ctx.editMessageText("Select the **Year**: (which contains the item you want to edit)", { parse_mode: 'Markdown', reply_markup: Markup.inlineKeyboard(buttons, {columns: 2}).reply_markup });
    });

    bot.action(/edit_year_(.+)/, async (ctx) => {
        if (ctx.from.id.toString() !== ADMIN_ID) return;
        const year = ctx.match[1];
        const state = await AdminState.findOneAndUpdate({ adminId: ADMIN_ID }, { year }, { new: true });
        
        if (state.targetType === 'YEAR') {
            await AdminState.findOneAndUpdate({ adminId: ADMIN_ID }, { step: 'EDIT_WAITING_NEW_NAME', oldName: year });
            ctx.editMessageText(`You selected Year: **${year}**\n\nPlease type the **NEW NAME** for this year:`, { parse_mode: 'Markdown' });
        } else {
            await AdminState.findOneAndUpdate({ adminId: ADMIN_ID }, { step: 'EDIT_CHOOSE_COACHING' });
            const coachings = await TestSeries.distinct('coaching', { year });
            const buttons = coachings.map(c => Markup.button.callback(c.substring(0, 30), `edit_coach_${c}`));
            ctx.editMessageText(`Selected Year: ${year}\nNow select the **Coaching**:`, { parse_mode: 'Markdown', reply_markup: Markup.inlineKeyboard(buttons, {columns: 1}).reply_markup });
        }
    });

    bot.action(/edit_coach_(.+)/, async (ctx) => {
        if (ctx.from.id.toString() !== ADMIN_ID) return;
        const coaching = ctx.match[1];
        const state = await AdminState.findOneAndUpdate({ adminId: ADMIN_ID }, { coaching }, { new: true });
        
        if (state.targetType === 'COACHING') {
            await AdminState.findOneAndUpdate({ adminId: ADMIN_ID }, { step: 'EDIT_WAITING_NEW_NAME', oldName: coaching });
            ctx.editMessageText(`You selected Coaching: **${coaching}**\n\nPlease type the **NEW NAME** for this coaching:`, { parse_mode: 'Markdown' });
        } else {
            await AdminState.findOneAndUpdate({ adminId: ADMIN_ID }, { step: 'EDIT_CHOOSE_TEST' });
            const tests = await TestSeries.find({ year: state.year, coaching });
            const buttons = tests.map(t => Markup.button.callback(`Test: ${t.testCode}`, `edit_test_${t.testCode}`));
            ctx.editMessageText(`Year: ${state.year}\nCoaching: ${coaching}\nNow select the **Test Code**:`, { parse_mode: 'Markdown', reply_markup: Markup.inlineKeyboard(buttons, {columns: 2}).reply_markup });
        }
    });

    bot.action(/edit_test_(.+)/, async (ctx) => {
        if (ctx.from.id.toString() !== ADMIN_ID) return;
        const testCode = ctx.match[1];
        await AdminState.findOneAndUpdate({ adminId: ADMIN_ID }, { testCode, step: 'EDIT_WAITING_NEW_NAME', oldName: testCode });
        ctx.editMessageText(`You selected Test Code: **${testCode}**\n\nPlease type the **NEW TEST CODE**:`, { parse_mode: 'Markdown' });
    });

};
