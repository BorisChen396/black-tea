import { SlashCommandBuilder, CommandInteraction, GuildMember } from 'discord.js';

import { join } from '../voice';

export const data = new SlashCommandBuilder()
        .setName('join')
        .setDescription('Join a voice channel.')
        .setDMPermission(false);

export function execute(interaction:CommandInteraction) : Promise<void> {
    return new Promise(async (resolve, reject) => {
        if(!interaction.guild) {
            reject('Guild ID is null.');
            return;
        }
        await interaction.deferReply();
        let member = interaction.member as GuildMember;
        if(!member.voice.channelId) {
            await interaction.editReply(`You need to join a voice channel first.`);
            reject('The user has no voice channel.');
            return;
        }
        try {
            let channelId = await join(member.voice.channelId, interaction.guild.id, interaction.guild.voiceAdapterCreator);
            if(channelId !== member.voice.channelId) {
                await interaction.editReply(`I have joined ${interaction.guild.channels.cache.get(channelId)?.name} already.`);
                reject(`Voice connection is already exists in guild ${interaction.guild.name}(${interaction.guild.id}).`);
                return;
            }
            await interaction.editReply(`Joined ${interaction.guild.channels.cache.get(channelId)?.name}.`);
            resolve();
        } catch (e) {
            await interaction.editReply('Unable to connect to the voice channel.');
            reject('Unable to connect to the voice channel.');
        }
    });
}
