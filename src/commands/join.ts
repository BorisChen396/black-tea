import { CommandInteraction, EmbedBuilder, Guild, GuildMember, SlashCommandBuilder, Colors } from "discord.js";
import { VoiceConnectionStatus, entersState, getVoiceConnection, joinVoiceChannel } from '@discordjs/voice';

const VOICE_CONNECTION_TIMEOUT = 10_000;

export const data = new SlashCommandBuilder()
    .setName('join')
    .setDescription('Join a voice channel.')
    .setDMPermission(false);

export const execute = (interaction : CommandInteraction) => {
    return new Promise<void>(async (resolve, reject) => {
        if(!interaction.guild) {
            reject(new Error('Guild object should not be null.'));
            return;
        }
        if(!(interaction.member instanceof GuildMember)) {
            reject(new Error(`Member type should be GuildMember.`));
            return;
        }
        if(!interaction.member.voice.channelId) {
            reject(new EmbedBuilder()
                .setTitle('No Voice Channel')
                .setDescription('You need to be in a voice channel before executing this command.')
                .setColor(Colors.Red));
            return;
        }
        let connected = getVoiceConnection(interaction.guild.id);
        if(connected) {
            if(interaction.member.voice.channelId === connected.joinConfig.channelId) {
                await interaction.reply({ embeds: [
                    new EmbedBuilder()
                        .setTitle('Joined Voice Channel')
                        .setDescription(`Joined "${getChannelName(interaction.guild, interaction.member.voice.channelId)}".`)
                        .setColor(Colors.Blue).data
                ]}).catch(console.error);
                resolve();
            }
            else reject(new EmbedBuilder()
                .setTitle('Too Many Voice Channels')
                .setDescription(`Disconnect me from ${getChannelName(interaction.guild, connected.joinConfig.channelId ?? '')} first.`)
                .setColor(Colors.Red));
            return;
        }
        await interaction.deferReply().catch(console.error);
        let connection = joinVoiceChannel({
            guildId: interaction.guild.id,
            channelId: interaction.member.voice.channelId,
            adapterCreator: interaction.guild.voiceAdapterCreator
        }).on(VoiceConnectionStatus.Disconnected, async () => {
            try {
                await Promise.race([
                    entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
                    entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
                ]);
            } catch (error) {
                connection.destroy();
            }
        });
        try {
            await entersState(connection, VoiceConnectionStatus.Ready, VOICE_CONNECTION_TIMEOUT);
            let message = new EmbedBuilder()
                .setTitle('Joined Voice Channel')
                .setDescription(`Joined "${getChannelName(interaction.guild, interaction.member.voice.channelId)}".`)
                .setColor(Colors.Blue);
            await interaction.followUp({ embeds:[ message.data ]}).catch(console.error);
            resolve();
        } catch (error) {
            connection.destroy();
            reject(new EmbedBuilder()
                .setTitle('Unable to Join the Voice Channel')
                .setDescription('Voice connection timeout.')
                .setColor(Colors.Red));
        }
    });
}

function getChannelName(guild : Guild, channelId : string) {
    return guild.channels.cache.get(channelId)?.name;
}