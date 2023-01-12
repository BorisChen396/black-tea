import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { next } from '../voice';

export const data = new SlashCommandBuilder()
        .setName('next')
        .setDescription('Skip to the next item of the queue.')
        .setDMPermission(false);

export function execute(interaction:ChatInputCommandInteraction) : Promise<void> {
    return new Promise(async (resolve, reject) => {
        if(!interaction.guild) {
            reject(new Error('Guild is null.'));
            return;
        }
        try {
            await interaction.deferReply();
        } catch (e) {
            reject(e);
            return;
        }
        next(interaction.guild).then(index => {
            interaction.editReply(`Skipped to #${index + 1}.`).then(() => resolve()).catch(reject);
        }).catch(async error => {
            try {
                if(error instanceof Error)
                    await interaction.editReply(error.message);
                else if(typeof error === 'string')
                    await interaction.editReply(error);
                else
                    await interaction.editReply('Unexpected error occurred.');
            } catch (e) {
                reject(e);
                return;
            }
            reject(error);
        });
    });
}