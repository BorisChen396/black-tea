import { AudioPlayerStatus, getVoiceConnection, VoiceConnectionReadyState, VoiceConnectionStatus } from "@discordjs/voice";
import { ChatInputCommandInteraction, GuildMember, SlashCommandBuilder } from "discord.js";
import { addItem, ItemInfo, join, playerInfos, skipTo } from "../voice";

export const data = new SlashCommandBuilder()
        .setName('play')
        .setDescription('Add a item to the queue.')
        .setDMPermission(false)
        .addStringOption(option => option.setRequired(true)
                .setName('url')
                .setDescription('The URL or the search query of the item.'));

export function execute(interaction:ChatInputCommandInteraction) : Promise<void> {
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
                reject(`Disconnect me from ${interaction.guild.channels.cache.get(channelId)?.name} first.`);
                return;
            }
            await interaction.editReply(`Joined ${interaction.guild.channels.cache.get(channelId)?.name}.`);
        } catch (e) {
            await interaction.editReply('Unable to join the voice channel.');
            console.error(e);
            reject('Unable to connect to the voice channel.');
            return;
        }

        let items : ItemInfo[];
        try {
            items = await addItem(interaction.options.getString('url') || '');
        } catch (e) {
            await interaction.editReply(`Unable to add the item.\n${e}`);
            console.error(e);
            reject(e);
            return;
        }
        let playerInfo = playerInfos.get(interaction.guild.id);
        if(!playerInfo) {
            playerInfo = {
                guildId: interaction.guild.id,
                queue: [],
                queuelock: true
            };
            playerInfos.set(interaction.guild.id, playerInfo);
        }
        else if(playerInfo.queuelock) {
            await interaction.editReply('Wait for the previous command to be completed, then try again.');
            reject(`Queue lock held. ${interaction.guild.id}`);
            return;
        }
        else playerInfo.queuelock = true;
        let autoplayIndex = playerInfo.queue.length;
        for(let item of items) playerInfo.queue.push(item);
        playerInfo.queuelock = false;
        await interaction.editReply(`Added ${items.length} item(s), ${playerInfo.queue.length} item(s) queued.`);
        playerInfo.channelId = interaction.channelId;
        if(getVoiceConnection(interaction.guild.id)?.state.status === VoiceConnectionStatus.Ready) {
            let state = getVoiceConnection(interaction.guild.id)?.state as VoiceConnectionReadyState;
            if(!state.subscription || state.subscription?.player.state.status === AudioPlayerStatus.Idle)
                await skipTo(interaction.guild, autoplayIndex);
        }
        else playerInfos.delete(interaction.guild.id);
        resolve();
    });
}
