import { Colors, CommandInteraction, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { execute as joinExec } from './join.js';
import { Voice } from "../voice.js";
import { VoiceConnectionStatus, getVoiceConnection } from "@discordjs/voice";

export const data = new SlashCommandBuilder()
    .setName('play')
    .setDescription('Add a item to the queue.')
    .setDMPermission(false)
    .addStringOption(option => option.setName('url')
        .setDescription('A URL or search query to add.')
        .setRequired(true));

export const execute = (interaction : CommandInteraction) => {
    return new Promise<void>(async (resolve, reject) => {
        if(!interaction.guildId) {
            reject(new Error('Guild ID should not be null.'));
            return;
        }
        try {
            await joinExec(interaction);
        } catch (e) {
            reject(e);
            return;
        }
        let url = interaction.options.get('url')?.value;
        if(typeof url !== 'string') {
            reject(new Error(`Invalid parameter type. Receiving "${typeof url}".`));
            return;
        }
        let result = await Voice.add(interaction.guildId, url).catch(reject);
        if(!result) return;
        Voice.setChannel(interaction.guildId, interaction.channelId);
        let message = new EmbedBuilder()
            .setTitle('Added Item(s)')
            .setDescription(result.count > 1 ? `Added ${result.count} items from "${result.title}".` : `Added "${result.title}".`)
            .setColor(Colors.Blue);
        await interaction.followUp({ embeds: [ message.data ]}).catch(console.error);
        resolve();
    });
}