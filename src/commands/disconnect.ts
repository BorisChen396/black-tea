import { getVoiceConnection } from '@discordjs/voice';
import { SlashCommandBuilder, CommandInteraction } from 'discord.js';
import { playerInfos } from '../voice';

export const data = new SlashCommandBuilder()
        .setName('disconnect')
        .setDescription('Disconnect from a voice channel.')
        .setDMPermission(false);

export function execute(interaction:CommandInteraction) : Promise<void> {
    return new Promise(async (resolve, reject) => {
        if(!interaction.guildId) {
            reject('Guild ID is null.');
            return;
        }
        if(playerInfos.get(interaction.guildId)?.queuelock) {
            reject('Player lock held.');
            return;
        }
        let connection = getVoiceConnection(interaction.guildId);
        if(!connection) {
            await interaction.reply('No connected voice channel.');
            reject('No connected voice channel.');
        }
        else if(connection.disconnect()) {
            await interaction.reply('Disconnected successfully.');
            resolve();
        }
        else {
            await interaction.reply('Unable to disconnect.');
            reject('Disconnect method returns false.');
        }
    });
}
