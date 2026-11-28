
import {
    SlashCommandBuilder,
    EmbedBuilder,
    MessageFlags,
} from 'discord.js';

const BANNER_URL =
    'https://media.discordapp.net/attachments/1571886706167119953/1572483281621090404/Meraki_feedback.png?ex=6b0bb7ad&is=6b0a662d&hm=1f8dffb91579a51f5ac33881968d2bbe46385aeac7806235a1e49502c370d7b4&format=webp&quality=lossless';

export default {
    data: new SlashCommandBuilder()
        .setName('review')
        .setDescription('Submit a customer review for Meraki Studios')

        .addIntegerOption(option =>
            option
                .setName('rating')
                .setDescription('Rate your experience from 1 to 5 stars')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(5)
        )

        .addStringOption(option =>
            option
                .setName('designer')
                .setDescription('Name of the designer who handled your order')
                .setRequired(true)
                .setMaxLength(100)
        )

        .addStringOption(option =>
            option
                .setName('review')
                .setDescription('Write about your experience')
                .setRequired(true)
                .setMaxLength(1000)
        ),

    async execute(interaction) {
        await interaction.deferReply({
            flags: MessageFlags.Ephemeral,
        });

        try {
            if (
                !interaction.guild ||
                !interaction.channel ||
                typeof interaction.channel.send !== 'function'
            ) {
                return interaction.editReply({
                    content: 'This command can only be used in a server text channel.',
                });
            }

            const pool = interaction.client.db?.db?.pool;

            if (!pool) {
                return interaction.editReply({
                    content: 'The database is currently unavailable.',
                });
            }

            await pool.query(`
                CREATE TABLE IF NOT EXISTS meraki_reviews (
                    id BIGSERIAL PRIMARY KEY,
                    guild_id VARCHAR(32) NOT NULL,
                    user_id VARCHAR(32) NOT NULL,
                    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
                    review TEXT NOT NULL,
                    designer VARCHAR(100),
                    channel_id VARCHAR(32),
                    message_id VARCHAR(32),
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
            `);

            await pool.query(`
                ALTER TABLE meraki_reviews
                ADD COLUMN IF NOT EXISTS designer VARCHAR(100);
            `);

            const rating = interaction.options.getInteger('rating');
            const designer = interaction.options.getString('designer');
            const review = interaction.options.getString('review');

            const result = await pool.query(
                `INSERT INTO meraki_reviews
                    (guild_id, user_id, rating, review, designer, channel_id)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 RETURNING id`,
                [
                    interaction.guildId,
                    interaction.user.id,
                    rating,
                    review,
                    designer,
                    interaction.channelId,
                ]
            );

            const reviewId = result.rows[0].id;
            const stars = '⭐'.repeat(rating);

            // Send the banner above the review embed.
            await interaction.channel.send({
                files: [
                    {
                        attachment: BANNER_URL,
                        name: 'Meraki_feedback.webp',
                    },
                ],
            });

            const embed = new EmbedBuilder()
                .setColor(0xFFD700)
                .setTitle(`Customer Review #${reviewId}`)
                .setDescription(review)
                .addFields(
                    {
                        name: 'Rating',
                        value: `${stars} (${rating}/5)`,
                        inline: true,
                    },
                    {
                        name: 'Customer',
                        value: `${interaction.user}`,
                        inline: true,
                    },
                    {
                        name: 'Designer',
                        value: designer,
                        inline: true,
                    }
                )
                .setThumbnail(interaction.user.displayAvatarURL())
                .setFooter({
                    text: 'Meraki Studios',
                })
                .setTimestamp();

            const message = await interaction.channel.send({
                embeds: [embed],
            });

            await pool.query(
                `UPDATE meraki_reviews
                 SET message_id = $1
                 WHERE id = $2`,
                [message.id, reviewId]
            );

            return interaction.editReply({
                content: 'Your review has been submitted. Thank you for choosing Meraki Studios!',
            });

        } catch (error) {
            console.error('Review command error:', error);

            return interaction.editReply({
                content: 'Something went wrong while submitting your review. Please try again.',
            });
        }
    },
};
