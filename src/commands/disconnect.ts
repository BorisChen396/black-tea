import { getVoiceConnection } from "@discordjs/voice";
import { Colors, CommandInteraction, EmbedBuilder, Guild, GuildMember, SlashCommandBuilder } from "discord.js";
import { Voice } from "../voice.js";

export const data = new SlashCommandBuilder()
    .setName('disconnect')
    .setDescription('Disconnect from the voice channel.')
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
        let connected = getVoiceConnection(interaction.guild.id);
        if(!connected) {
            reject(new EmbedBuilder()
                .setTitle('No Connected Voice Channel')
                .setDescription(`Add me to a voice channel first.`)
                .setColor(Colors.Red));
            return;
        }
        let channelId = connected.joinConfig.channelId;
        if(interaction.member.voice.channelId !== connected.joinConfig.channelId) {
            reject(new EmbedBuilder()
                .setTitle('Denied :>')
                .setDescription(`You need to be in "${getChannelName(interaction.guild, channelId ?? '')}" to execute this command.`)
                .setColor(Colors.Red));
            return;
        }
        connected.destroy();
        Voice.cleanup(interaction.guild.id);
        let message = new EmbedBuilder()
            .setTitle('Disconnected Successfully')
            .setDescription(`Disconnected from "${getChannelName(interaction.guild, channelId ?? '')}".`)
            .setColor(Colors.Blue);
        await interaction.reply({ embeds: [message]}).catch(console.error);
        resolve();
    });
}

function getChannelName(guild : Guild, channelId : string) {
    return guild.channels.cache.get(channelId)?.name;
}