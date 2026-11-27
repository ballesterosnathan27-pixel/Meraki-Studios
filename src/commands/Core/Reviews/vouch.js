
import {
    SlashCommandBuilder,
    EmbedBuilder,
    MessageFlags,
} from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('vouch')
        .setDescription('Submit a customer review')
        .addIntegerOption(option =>
            option
                .setName('rating')
                .setDescription('Rate your experience from 1 to 5')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(5)
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
            if (!interaction.guild || !interaction.client.db?.db?.pool) {
                return interaction.editReply({
                    content: 'The database is currently unavailable.',
                });
            }

            const pool = interaction.client.db.db.pool;

            await pool.query(`
                CREATE TABLE IF NOT EXISTS meraki_reviews (
                    id BIGSERIAL PRIMARY KEY,
                    guild_id VARCHAR(32) NOT NULL,
                    user_id VARCHAR(32) NOT NULL,
                    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
                    review TEXT NOT NULL,
                    channel_id VARCHAR(32),
                    message_id VARCHAR(32),
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
            `);

            const rating = interaction.options.getInteger('rating');
            const review = interaction.options.getString('review');

            const result = await pool.query(
                `INSERT INTO meraki_reviews
                    (guild_id, user_id, rating, review, channel_id)
                 VALUES ($1, $2, $3, $4, $5)
                 RETURNING id`,
                [
                    interaction.guildId,
                    interaction.user.id,
                    rating,
                    review,
                    interaction.channelId,
                ]
            );

            const reviewId = result.rows[0].id;
            const stars = '⭐'.repeat(rating);

            const embed = new EmbedBuilder()
                .setColor(0xD4AF37)
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
                content: 'Your review has been submitted. Thank you!',
            });

        } catch (error) {
            console.error('Vouch command error:', error);

            return interaction.editReply({
                content: 'Something went wrong while submitting your review. Please try again.',
            });
        }
    },
};

