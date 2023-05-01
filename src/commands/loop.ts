import { Colors, CommandInteraction, EmbedBuilder, Guild, GuildMember, SlashCommandBuilder } from "discord.js";
import { Voice } from "../voice.js";
import { title } from "process";
import { getVoiceConnection } from "@discordjs/voice";

export const data = new SlashCommandBuilder()
    .setName('loop')
    .setDescription('Configure loop mode of the player.')
    .setDMPermission(false)
    .addStringOption(option => option.setName('mode')
        .setDescription('Specify a loop mode.')
        .addChoices({
            name: 'single',
            value: 'single'
        }, {
            name: 'queue',
            value: 'queue'
        }, {
            name: 'none',
            value: 'none'
        })
        .setRequired(true));

export const execute = (interaction : CommandInteraction) => 
    new Promise<void>(async (resolve, reject) => {
        if(!interaction.guild) {
            reject(new Error('Guild should not be null.'));
            return;
        }
        if(!(interaction.member instanceof GuildMember)) {
            reject(new Error(`Member type should be GuildMember.`));
            return;
        }
        let connected = getVoiceConnection(interaction.guild.id);
        if(!connected) {
            reject(new EmbedBuilder()
                .setTitle('No Connected Voice Channel')
                .setDescription(`Add me to a voice channel first.`)
                .setColor(Colors.Red));
            return;
        }
        let channelId = connected.joinConfig.channelId;
        if(!Voice.checkVoiceChannel(interaction.guild.id, interaction.member.voice.channelId ?? undefined)) {
            reject(new EmbedBuilder()
                .setTitle('Denied :>')
                .setDescription(`You need to be in "${getChannelName(interaction.guild, channelId ?? '')}" to execute this command.`)
                .setColor(Colors.Red));
            return;
        }
        let mode = interaction.options.get('mode')?.value as 'queue' | 'single' | 'none';
        Voice.setLoopMode(interaction.guild.id, mode === 'none' ? undefined : mode);
        await interaction.reply({ embeds: [
            new EmbedBuilder()
                .setTitle('Configured Loop Mode')
                .setDescription(`Loop mode is set to "${mode}".`)
                .setColor(Colors.Blue)
                .data
        ]}).catch(console.error);
        resolve();
    });

function getChannelName(guild : Guild, channelId : string) {
    return guild.channels.cache.get(channelId)?.name;
}