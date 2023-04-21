import { getVoiceConnection } from "@discordjs/voice";
import { Colors, CommandInteraction, EmbedBuilder, Guild, GuildMember, SlashCommandBuilder } from "discord.js";
import { Voice } from "../voice.js";

export const data = new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Play a queued item.')
    .setDMPermission(false)
    .addIntegerOption(option => option.setName('index')
        .setDescription('Specify the index of the item.')
        .setRequired(true));

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
        let index = interaction.options.get('index')?.value;
        if(typeof index !== 'number') {
            reject(new Error(`Invalid parameter type. Receiving "${typeof index}".`));
            return;
        }
        await interaction.deferReply().catch(console.error);
        let message = await Voice.skipTo(interaction.guild.id, --index).catch(reject);
        if(!message) return;
        await interaction.followUp({ embeds: [ message.data ]}).catch(console.error);
        resolve();
    });
}

function getChannelName(guild : Guild, channelId : string) {
    return guild.channels.cache.get(channelId)?.name;
}