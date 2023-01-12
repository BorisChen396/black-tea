import { SlashCommandBuilder, CommandInteraction, GuildMember } from 'discord.js';

import { join } from '../voice';

export const data = new SlashCommandBuilder()
        .setName('join')
        .setDescription('Join a voice channel.')
        .setDMPermission(false);

export function execute(interaction:CommandInteraction) : Promise<void> {
    return new Promise(async (resolve, reject) => {
        if(!interaction.guild) {
            reject(new Error('Guild ID is null.'));
            return;
        }
        try {
            await interaction.deferReply();
        } catch (e) {
            reject(e);
            return;
        }
        let member = interaction.member as GuildMember;
        if(!member.voice.channelId) {
            interaction.editReply(`You need to join a voice channel first.`).then(() => {
                reject(new Error('The user has no voice channel.'));
            }).catch(reject);
            return;
        }
        let channelId : string;
        try {
            channelId = await join(member.voice.channelId, interaction.guild.id, interaction.guild.voiceAdapterCreator);
            resolve();
        } catch (e) {
            interaction.editReply('Unable to connect to the voice channel.').then(() => {
                reject(new Error('Unable to connect to the voice channel.'));
            }).catch(reject);
            return;
        }
        if(channelId !== member.voice.channelId) {
            try {
                await interaction.editReply(`I have joined ${interaction.guild.channels.cache.get(channelId)?.name} already.`);
                reject(new Error(`Voice connection is already exists in guild ${interaction.guild.name}(${interaction.guild.id}).`));
            } catch (e) {
                reject(e);
            }
            return;
        }
        try {
            if(channelId !== member.voice.channelId) {
                await interaction.editReply(`I have joined ${interaction.guild.channels.cache.get(channelId)?.name} already.`);
                reject(new Error(`Voice connection is already exists in guild ${interaction.guild.name}(${interaction.guild.id}).`));
            }
            else {
                await interaction.editReply(`Joined ${interaction.guild.channels.cache.get(channelId)?.name}.`);
                resolve();
            }
        } catch (e) {
            reject(e);
        }
    });
}
