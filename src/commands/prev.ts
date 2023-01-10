import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { prev } from '../voice';

export const data = new SlashCommandBuilder()
        .setName('prev')
        .setDescription('Skip to the previous item of the queue.')
        .setDMPermission(false);

export function execute(interaction:ChatInputCommandInteraction) : Promise<void> {
    return new Promise(async (resolve, reject) => {
        if(!interaction.guild) {
            reject('Guild is null.');
            return;
        }
        await interaction.deferReply();
        try {
            await interaction.editReply(`Skipped to #${await prev(interaction.guild) + 1}.`);
            resolve();
        } catch (e) {
            if(e instanceof Error)
                await interaction.editReply(e.message);
            else if(typeof e === 'string')
                await interaction.editReply(e);
            else
                await interaction.editReply('Unexpected error occurred.');
            reject(e);
        }
    });
}