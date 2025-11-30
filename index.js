const { Client, GatewayIntentBits, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, ChannelType } = require('discord.js');
const express = require('express');

// Configuração do Bot
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers // Necessário para acessar msg.member e guildMemberAdd
    ]
});

// Configuração do Servidor Web para o Uptime Robot
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('O bot está online!');
});

app.listen(port, () => {
    console.log(`Servidor web rodando na porta ${port}`);
});

// Evento que é acionado quando o bot está pronto
client.on('ready', () => {
    console.log(`Bot logado como ${client.user.tag}!`);
});

// Evento que é acionado quando um novo membro entra no servidor
client.on('guildMemberAdd', async member => {
    console.log(`Novo membro "${member.user.tag}" entrou no servidor.`);
 
    // ID do cargo que você quer adicionar automaticamente.
    // SUBSTITUA 'SEU_ID_DO_CARGO_AQUI' PELO ID REAL DO CARGO.
    const roleId = '1444513061443731597';
 
    // Procura o cargo no servidor pelo ID.
    const role = member.guild.roles.cache.get(roleId);
 
    if (!role) {
        console.error(`O cargo com o ID "${roleId}" não foi encontrado. Verifique se o ID está correto.`);
        return;
    }
 
    try {
        await member.roles.add(role);
        console.log(`Cargo "${role.name}" adicionado para ${member.user.tag}.`);
    } catch (error) {
        console.error(`Falha ao adicionar o cargo. Verifique se o bot tem a permissão "Gerenciar Cargos" e se seu cargo está acima do cargo "${role.name}".`);
    }
});

// Evento que é acionado a cada mensagem enviada
client.on('messageCreate', async msg => {
    // Ignora mensagens que não são de um servidor (ex: DMs) ou de outros bots
    if (!msg.guild || msg.author.bot) return;

    // --- COMANDO !castigar ---
    if (msg.content.startsWith('!castigar')) {
        // 1. VERIFICA SE O AUTOR É ADMINISTRADOR
        if (!msg.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return msg.reply('Você não tem permissão para usar este comando.').then(m => setTimeout(() => m.delete(), 5000));
        }

        // 2. VERIFICA SE A VARIÁVEL DE AMBIENTE ESTÁ CONFIGURADA
        const roleId = process.env.CASTIGADO_ROLE_ID;
        if (!roleId) {
            return msg.reply('ERRO: A variável de ambiente `CASTIGADO_ROLE_ID` não foi configurada no Render.');
        }
        
        const targetMember = msg.mentions.members.first();
        if (!targetMember) {
            return msg.reply('Você precisa mencionar o membro que deseja castigar. Ex: `!castigar @usuario`');
        }

        // 3. BUSCA O CARGO DE CASTIGO
        const castigadoRole = msg.guild.roles.cache.get(roleId);
        if (!castigadoRole) {
            return msg.reply('ERRO: O cargo de castigo não foi encontrado. Verifique o ID em `CASTIGADO_ROLE_ID`.');
        }

        // 4. CRIA O CANAL DE JULGAMENTO PRIVADO
        let julgamentoChannel;
        try {
            julgamentoChannel = await msg.guild.channels.create({
                name: `julgamento-${targetMember.user.username}`,
                type: ChannelType.GuildText,
                permissionOverwrites: [
                    { // Nega a todos verem o canal
                        id: msg.guild.id, // @everyone
                        deny: [PermissionsBitField.Flags.ViewChannel],
                    },
                    { // Permite que o membro castigado veja o canal
                        id: targetMember.id,
                        allow: [PermissionsBitField.Flags.ViewChannel],
                    },
                    { // Permite que o bot veja e gerencie o canal
                        id: client.user.id,
                        allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageChannels],
                    }
                ],
            });
        } catch (e) { console.error(e); return msg.reply("Ocorreu um erro ao criar o canal de julgamento."); }

        // 5. APLICA O CARGO DE CASTIGO
        try {
            await targetMember.roles.add(castigadoRole);
            await msg.reply(`${targetMember.user.tag} foi enviado para o canal de julgamento: ${julgamentoChannel}`);
        } catch (error) {
            console.error(error);
            return msg.reply('Não foi possível aplicar o cargo. Verifique a hierarquia de cargos e as permissões do bot.');
        }

        // 6. CRIA OS BOTÕES DE DECISÃO
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`perdoar_${targetMember.id}`)
                    .setLabel('Perdoar')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(`rejeitar_${targetMember.id}`)
                    .setLabel('Rejeitar (Castigo 4min)')
                    .setStyle(ButtonStyle.Danger)
            );

        // 7. ENVIA A MENSAGEM NO CANAL DE JULGAMENTO
        await julgamentoChannel.send({
            content: `**Julgamento:** ${targetMember}\n\nO administrador ${msg.author} decidirá seu destino.`,
            components: [row]
        });

        return; // Finaliza aqui para não processar o resto
    }

    // --- FIM DO COMANDO !castigar ---

    // --- MODERAÇÃO DE LINKS ---
    // Verifica se o membro que enviou a mensagem é um administrador
    if (msg.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return; // Se for admin, ignora a moderação de links
    }

    const linkRegex = /(https?:\/\/[^\s]+)/g;
    if (linkRegex.test(msg.content)) {
        try {
            await msg.delete();
        } catch (error) {
            console.error("Falha ao apagar a mensagem. Verifique as permissões.");
            return;
        }

        try {
            await msg.author.send('Você recebeu uma advertência: não mande links neste servidor.');
        } catch (error) {
            console.error(`Não foi possível enviar DM para ${msg.author.tag}.`);
        }

        const fiveMinutes = 5 * 60 * 1000;
        try {
            await msg.member.timeout(fiveMinutes, 'Enviou um link no chat.');
            const replyMsg = await msg.channel.send(`${msg.author}, você foi colocado de castigo por 5 minutos por enviar um link.`);
            setTimeout(() => replyMsg.delete(), 10000);
        } catch (error) {
            console.error(`Falha ao aplicar castigo em ${msg.author.tag}.`);
        }
        
        return;
    }
    // --- FIM DA MODERAÇÃO DE LINKS ---

    // Comando de teste "ping"
    if (msg.content.toLowerCase() === 'ping') {
        msg.reply('Pong!');
    }
});

// --- LISTENER PARA INTERAÇÕES (BOTÕES) ---
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    // Verifica se o usuário que clicou tem permissão de admin
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({ content: 'Apenas administradores podem tomar esta decisão.', ephemeral: true });
    }

    const [action, targetId] = interaction.customId.split('_');
    const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);
    const castigadoRole = interaction.guild.roles.cache.get(process.env.CASTIGADO_ROLE_ID);

    if (!targetMember || !castigadoRole) {
        return interaction.update({ content: 'Membro ou cargo não encontrado.', components: [] });
    }

    if (action === 'perdoar') {
        try {
            await targetMember.roles.remove(castigadoRole);
            await interaction.update({ content: `Decisão: ${targetMember.user.tag} foi perdoado por ${interaction.user}. Este canal será apagado em 5 segundos.`, components: [] });
            setTimeout(() => interaction.channel.delete(), 5000);
        } catch (error) {
            console.error(error);
            await interaction.update({ content: 'Falha ao remover o cargo.', components: [] });
        }
    }

    if (action === 'rejeitar') {
        try {
            const fourMinutes = 4 * 60 * 1000;
            await targetMember.timeout(fourMinutes, `Rejeitado no julgamento por ${interaction.user.tag}`);
            await targetMember.roles.remove(castigadoRole);
            await interaction.update({ content: `Decisão: ${targetMember.user.tag} foi rejeitado e recebeu 4 minutos de castigo. Este canal será apagado em 5 segundos.`, components: [] });
            setTimeout(() => interaction.channel.delete(), 5000);
        } catch (error) {
            console.error(error);
            await interaction.update({ content: 'Falha ao aplicar o castigo.', components: [] });
        }
    }
});
// --- FIM DO LISTENER ---

// Lê o token da variável de ambiente
const TOKEN = process.env.DISCORD_TOKEN;

// Verifica se o token foi fornecido antes de tentar fazer o login
if (!TOKEN) {
    console.error("Erro: A variável de ambiente DISCORD_TOKEN não foi definida. Certifique-se de configurá-la na sua plataforma de hospedagem (Render).");
    process.exit(1); // Encerra o processo se o token não for encontrado
}

client.login(TOKEN);
