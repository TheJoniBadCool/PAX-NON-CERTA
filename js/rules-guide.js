(() => {
    const guide = {
        en: {
            title: '📖 How to play',
            subtitle: 'Quick start and complete rules for every game feature.',
            basic: 'Quick guide',
            detailed: 'Detailed rules',
            close: 'Got it',
            chaptersLabel: 'Rules chapters',
            page: (number, total) => `Chapter ${number} of ${total}`,
            chapters: [
                {
                    title: '1. The goal',
                    art: 'board',
                    basic: [
                        'Choose 2–4 players. Each player commands a color and starts in a corner.',
                        'Plan in secret. When everyone is ready, all moves resolve together.',
                        'Complete objectives to score. Reach 10 points to win; a score of −10 eliminates you.'
                    ],
                    detailed: [
                        'Choose 2–4 players and a 12×12 or 16×16 board. Red starts top-left, Blue top-right, Green bottom-right, and Yellow bottom-left.',
                        'In a standard setup, each selected player starts with one Tower castle holding 12 units: a King, Queen, two Towers, two Bishops, two Horses, and four Pawns. Every other province has a stationary rebel Tower with a Pawn inside and one rebel Pawn outside; rebels do not take turns.',
                        'The board is divided into 16 provinces. A province belongs to a player when all Towers in it belong to that player; its tint changes with castle ownership. Empty, rebel, or contested provinces are neutral. Defeating rebels can recruit their non-Tower survivors.',
                        'Choose 8 resources (default: rebel provinces minus four), 12 resources (all rebel provinces), or 16 resources (one in every province). With 12 rebel provinces, the 8- and 12-resource lists are 1 horse, 3 food, 2 wood, 1 metal, 1 gold, or 2 horses, 4 food, 3 wood, 2 metal, 1 gold. The 16-resource list is 3 horses, 5 food, 4 wood, 3 metal, and 1 gold. Other rebel counts scale the proportions for the 8- and 12-resource modes; custom maps use their existing rebel provinces in those modes.',
                        'By default each province resource gets a fixed random production chance from 5% through 95%, shown in its tooltip. Optional resource balance makes the chances in each populated 2×2 corner quadrant total 25%, with a minimum of 5% each. You can allow empty quadrants or require at least one resource in each; the latter needs enough eligible provinces. There are no production numbers. After rounds 4, 8, 12, etc., each eligible province rolls independently to give its current owner one resource; every resource can succeed or fail. Rebel, empty, contested, inactive, and eliminated provinces produce nothing. Resource icons avoid mountains and remain visible through fog. Chances persist through conquest. Stockpiles start at zero, accumulate without a cap, and are shown privately as icons and counts on your player card.',
                        'Allow resources in player capitals optionally adds player-owned provinces to the random placement pool without increasing the resource count or guaranteeing capitals a resource. It is always enabled for 16 resources and works with quadrant balancing. In custom maps, empty and contested provinces remain ineligible for 8/12 resources, and the resource count still uses exclusively rebel-owned provinces.',
                        'Each player has a private checklist of randomly chosen objectives. For standard generated setups, a seed recreates starting positions, Tower gates, initial levels, and terrain. Sandbox saves also preserve manually edited terrain, resources, and unit placement. A seed alone cannot recreate manual edits. Objectives and combat rolls remain random.',
                        'Scores are checked after the whole round, including siege casualties and retreat re-entry. Players at −10 or below are eliminated together; then enemy-defeat rewards are applied. Reach 10 or more to win. Ties share victory; if everyone is eliminated, the game is a draw.',
                        'A dead King does not by itself eliminate a player, and being the last player alive is not an automatic win.'
                    ]
                },
                {
                    title: '2. Plan a turn',
                    art: 'plans',
                    basic: [
                        'On your turn, select any number of your pieces and queue their moves.',
                        'Click or tap one of your pieces, then an adjacent square, to choose where it goes.',
                        'Your moves stay hidden from opponents until everyone commits their plans.',
                        'Use Reset Plans to clear your queued actions; Commit Plans to lock them in.'
                    ],
                    detailed: [
                        'You may move zero, one, or multiple surviving pieces in a round. In Hotseat, pass the device between players; in Multiplayer, each player plans on their own device.',
                        'Plans are hidden from other players. In Multiplayer, the host can inspect submitted plans; guests see only their own. A player can unlock a committed plan until the final player commits. The host resolves the round.',
                        'Existing prisoner release and execution decisions resolve first. Then pieces leave their starting squares, opposing swaps resolve, friendly arrivals merge, and remaining enemy stacks fight.',
                        'Moves into the same square, crossing enemy moves, and moving onto a stationary enemy can all cause a battle. Friendly paths do not intercept each other.',
                        'Use the colored arrows to review planned moves: green for movement, yellow for merges, red for likely battles, and blue for transfers. Reset Plans clears only your own plans; Commit Plans locks them. Hotseat shows a privacy handoff between players.',
                        'The battle window pauses resolution: press Start Battle to roll, then Proceed after reviewing the result. Expand Rolls or tap ⓘ for dice and rules; hover or tap unit and stat details for odds, casualty chances, and bonuses. The combat log can be hidden or shown without clearing it.'
                    ]
                },
                {
                    title: '3. Movement & stacks',
                    art: 'movement',
                    basic: [
                        'Most pieces move exactly one square in any direction, including diagonally.',
                        'Pawns normally move or act only on odd-numbered rounds: 1, 3, 5, and so on.',
                        'Towers do not move. Use the marked gate to enter or leave them.'
                    ],
                    detailed: [
                        'Pawn, Horse (Knight), Bishop, Queen, and King pieces move exactly one adjacent square in any of the eight directions. Mountains cannot be entered.',
                        'Pawns cannot initiate movement, attacks, merging, unmerging, or transfers on even rounds. A stack containing a Pawn cannot move as a whole on even rounds, but its non-Pawn units may be separated, moved, or transferred. Non-Pawns may join the stack.',
                        'A ready siege assault and Sally Out can happen on even rounds. A new siege can begin only on an odd round.',
                        'Towers (Rooks) and stacks led by a Tower are stationary. Each Tower has one randomly chosen gate marked by an arrow. Merges, transfers, splitting units out, and sieges must use the adjacent gate square. Generated Towers start at least two squares apart, including diagonally; sandbox placement has no spacing restriction.'
                    ]
                },
                {
                    title: '4. Join forces',
                    art: 'merge',
                    basic: [
                        'Move onto a friendly piece to merge, or choose two friendly pieces moving to the same square and they merge automatically.',
                        'A stack moves together as one piece, or you can select a unit inside it to split that unit off.',
                        'Friendly pieces never fight each other.'
                    ],
                    detailed: [
                        'Moving onto a friendly piece asks whether to merge or cancel. An accepted merge commits the involved pieces for the round. Friendly pieces planned to the same square merge automatically.',
                        'Same-player pieces arriving together form one stack before combat. The resulting piece type is chosen by priority: Tower, Pawn, Horse, Bishop, King, then Queen.',
                        'Select a piece to plan for its whole stack. Right-click or long-press to open its unit list; select a movable unit, then choose an adjacent square to split it off. A transfer to a friendly piece requires confirmation.',
                        'Towers can only receive or release units through their marked gate. Pawns and prisoners follow the odd-round restriction.'
                    ]
                },
                {
                    title: '5. Battles & retreats',
                    art: 'battle',
                    basic: [
                        'When enemies meet, the game compares their strength and rolls for the outcome.',
                        'The winner may lose units. Defeated units can be captured, while other survivors retreat.',
                        'Retreating units return after three rounds, but become Routed and fight less effectively.'
                    ],
                    detailed: [
                        'Battles can start when enemies target the same square, cross paths, or one moves onto a stationary enemy. Friendly arrivals combine before opponents fight.',
                        'Counted units provide strength. Having more counted units than the strongest opposing stack adds 20% per extra unit. King, Queen/Bishop morale, experience, armour, terrain, and stationary Tower defence can also change the odds. A nonlinear odds curve makes larger forces more influential without removing randomness.',
                        'If any fighting candidate has a Pawn, Tower, or Horse, only those types count toward standard-league stack size. Each counted unit above the strongest opponent adds 20%; each King adds 10% morale and each Queen or Bishop adds 5%. If every candidate contains only Kings, Queens, and Bishops, all units count toward stack size and those morale bonuses do not apply. Strength is raised to the 1.35 power before the weighted roll.',
                        'Experience and armour each add 5% strength and reduce that unit’s casualty risk by 5% per level (maximum level 3). A stationary defending stack with a Tower and other combat units multiplies its battle weight by 3. A lone losing Queen or King has a 60% or 75% base casualty risk before modifiers; winners get 50% casualty protection.',
                        'Surviving combat units gain one experience level after each battle, up to level 3. Defeated casualties are captured. The winner chooses Prisoner or Execute for captured player units; non-Tower rebel survivors are recruited automatically. Winner casualties die. Other defeated survivors retreat for three rounds. Each retreat adds Routed (up to three): −20% strength and +25 percentage points casualty risk per stack. Routed lasts through the re-entry round and the next five rounds. Merging or splitting does not clear it.'
                    ]
                },
                {
                    title: '6. Prisoners',
                    art: 'prisoners',
                    basic: [
                        'Captured units become prisoners unless their captor chooses to execute them.',
                        'Prisoners cannot fight. You can move them with your forces or release them.',
                        'A released unit returns to its original player after a three-round re-entry.'
                    ],
                    detailed: [
                        'Prisoners keep their original color and artwork and show chains in their captor’s color. They belong to the captor, cannot attack, and provide no combat bonuses.',
                        'Prisoners may move, split, or transfer only on odd rounds, and can merge into friendly stacks or a Tower through its gate. Prisoner-only stacks always lose when attacked; their units are captured, never killed or routed by battle. In a mixed stack, prisoners take no casualties and follow the winner’s custody.',
                        'Click, right-click, or long-press a prisoner-containing piece to open its unit list. Queue Execute or Release for an existing prisoner; Reset Plans cancels that choice. Decisions happen before movement, so the remaining stack may still move.',
                        'Released units return to their original player through three-round re-entry without Routed penalties. They wait if no square is free; released units of eliminated players stay still. Prisoners count as alive for objectives until executed. Recapturing your own units returns them to normal service.'
                    ]
                },
                {
                    title: '7. Terrain & visibility',
                    art: 'terrain',
                    basic: [
                        'Mountains block movement. Forests hide troops; forests and hills can protect defenders.',
                        'You do not see every enemy. Your provinces and nearby pieces reveal parts of the map.',
                        'Fog and forest hiding conceal information on screen; they do not hide the board from the Multiplayer host.'
                    ],
                    detailed: [
                        'Maps contain roughly 50% plains, 20% forests, 20% hills, and 10% mountains. Castles start on plains. Mountains are impassable and cannot be used for retreat re-entry.',
                        'A force that stays in a forest and is attacked gains +25% strength. A force gets the same hill bonus only if it held that square throughout the previous round. Arriving forces and opposing swaps do not receive terrain defence. Plains have no effect.',
                        'You see your owned provinces and the eight provinces around them, including diagonals. Each friendly piece reveals a 3×3 area; a stack with a non-prisoner Bishop reveals a 5×5 area. Sight follows current positions and castle ownership, not planned moves.',
                        'Enemy and rebel troops outside sight are hidden; Towers and gates remain visible, but hidden garrisons do not. Forest troops remain hidden even when the square is revealed. Battles reveal participants; game over reveals the board. Fog is visual, not network secrecy. Province tints and terrain stay visible under fog.',
                        'The map preview shows the starting castles and terrain. A seed reproduces the generated starting positions, Tower gates, initial levels, and terrain; it does not fix objectives or battle rolls. Map generation aims to keep passable terrain connected, though crowded custom placements can affect terrain ratios.'
                    ]
                },
                {
                    title: '8. Sieges',
                    art: 'siege',
                    basic: [
                        'A Pawn can attack an enemy Tower by starting a siege instead of fighting right away.',
                        'The catapult waits while its assault timer counts down. Defenders can Sally Out to fight.',
                        'If the Tower timer runs out, its garrison is lost piece by piece.'
                    ],
                    detailed: [
                        'Attacking a Tower with at least one non-prisoner Pawn starts a siege instead of a normal battle. New sieges start only on odd rounds. The Pawn stays at its starting square as a catapult.',
                        'The catapult has a three-round assault timer. When ready, it can attack the adjacent Tower even on an even round. The besieged Tower has a six-round timer; after it reaches zero, one random non-prisoner, non-Tower unit is lost each round.',
                        'A besieged Tower cannot move, merge, transfer, or split units out. Non-Tower defenders may Sally Out if at least one can fight, even on an even round. Survivors return inside if the catapult survives; defeated casualties are captured.',
                        'A successful siege automatically conquers the Tower. Counterattacks exclude the Tower itself.',
                        'Use Cancel Siege on your catapult to withdraw it. In Hotseat this cancels immediately; in Multiplayer it is a planned action that uses up that catapult’s action for the round. If the defender also queues Sally Out, they still fight the cancelling catapult.'
                    ]
                },
                {
                    title: '9. Objectives & victory',
                    art: 'score',
                    basic: [
                        'Check your private objective list to see how to gain or lose points.',
                        'Reach 10 points to win. Reach −10 points to be eliminated.',
                        'Your King’s death hurts your score, but does not automatically end your game.'
                    ],
                    detailed: [
                        'At match start, objectives are randomly targeted: +4 for a target enemy’s defeat, +3 for a target enemy King’s death, +2 for a specific enemy Queen’s death, and +1 for controlling a specific enemy Tower/castle.',
                        'Penalties are −4 if your King dies and −3 for each starting castle lost. Castle objectives reverse if ownership changes back. Retreating units still count as alive; prisoners count as alive until executed.',
                        'Scores update after the whole round, including siege losses and returning units. Players at −10 or below are permanently eliminated together. Then enemy-defeat rewards are applied.',
                        'The first player to reach 10 or more wins; simultaneous winners share victory. The last player standing must still reach 10. If all active players are eliminated, the game is a draw.'
                    ]
                },
                {
                    title: '10. Game modes & setup',
                    art: 'modes',
                    basic: [
                        'Hotseat: share one device and pass it to the next player.',
                        'Multiplayer: each player uses a browser; the host creates a room and shares its code.',
                        'You can preview a map or place pieces in a custom setup before play.'
                    ],
                    detailed: [
                        'Hotseat uses one device. Each player plans privately before passing it on. Multiplayer uses one browser per player; the host creates a room, chooses 2–4 players, and shares the five-letter code.',
                        'The host’s browser runs the authoritative game and should stay open. Players lock in plans; after resolution, the next round begins. Guests may reconnect with the room code from the same browser tab session.',
                        'Before starting, choose the board size and player names. Generate a map preview to see its seed; for a generated setup, entering it recreates starting positions, Tower gates, levels, and terrain. Custom placement keeps the generated map while you edit; saved sandbox maps preserve manual changes as well.',
                        'Choose unit progression: all units start at level 0, or each unit gets a random experience and armour level from 1 to 3. Custom placement is an unrestricted sandbox: place or erase any armies, including rebels, paint biomes, and place resources with individual 0–100% production probabilities. Multiple resource types may share a square. No King/Queen/Tower requirements or tower-spacing checks apply. Objectives for absent units are omitted, so normal victory may be unattainable. Save/Load preserves the edited map; Reset clears only pieces. Generate Map replaces terrain/resources after confirmation. Exit to Menu leaves setup.',
                        'In Multiplayer, the host chooses the board, player count, progression, map seed, and starting position. For custom placement, use Place Pieces / Load Setup, then Use Placement to return to the lobby; the saved setup must match the room’s players. Everyone must be connected before the host can start.',
                        'During a game, use Names to edit player names (in Multiplayer, each player can edit only their own). Player cards show status, retreating units, and losses; the private objective panel shows only your objectives and score. Menu returns to mode selection; New Game/Play Again starts another setup, but only the Multiplayer host can restart the room. The host can skip disconnected players; eliminated players become spectators and are not asked to plan.'
                    ]
                },
                {
                    title: '11. Progression & controls',
                    art: 'battle',
                    basic: [
                        'Units gain experience by surviving battles. Armour can be upgraded from a Tower stack.',
                        'Use a piece’s unit list to manage individual units, prisoner actions, siege actions, and upgrades.',
                        'Check the player cards, private objectives, map seed, and combat log for match status.'
                    ],
                    detailed: [
                        'Experience increases by one level for each non-prisoner survivor after a battle, up to level 3. Each experience level adds 5% strength and reduces that unit’s casualty risk by 5%. The setup option can instead start units at random experience and armour levels 1–3.',
                        'During planning, open a friendly piece’s unit list with right-click or a 500 ms long-press. A unit in a stack containing a Tower can be upgraded with the shield button, up to armour level 3; each level adds 5% strength and reduces casualty risk by 5%. Multiplayer upgrades are applied by the host.',
                        'Click or tap a friendly piece and then an adjacent square to act. Select a held unit from the unit list to move it alone or transfer it. Prisoner-containing pieces expose Execute and Release; catapults and besieged Towers expose siege actions. Reset Plans cancels queued moves, siege actions, and prisoner decisions, but does not undo armour upgrades already applied.',
                        'The objective checklist is private and is cleared during Hotseat handoffs and resolution. Edit names with Names above the board. The combat log can be collapsed; its entries remain available when reopened. Battle cards show odds, bonus sources, casualties, capture choices, and rolls.'
                    ]
                }
            ],
        },
        pt: {
            title: '📖 Como jogar',
            subtitle: 'Guia rápido e regras completas para todas as funcionalidades.',
            basic: 'Guia rápido',
            detailed: 'Regras detalhadas',
            close: 'Fechar',
            chaptersLabel: 'Capítulos das regras',
            page: (number, total) => `Capítulo ${number} de ${total}`,
            chapters: [
                {
                    title: '1. Objetivo do jogo',
                    art: 'board',
                    basic: [
                        'Joguem 2 a 4 pessoas. Cada jogador comanda uma cor e começa num canto.',
                        'Planeie em segredo. Quando todos confirmarem os planos, as jogadas são resolvidas em simultâneo.',
                        'Cumpra objetivos para ganhar pontos. Chegue aos 10 pontos para vencer; com −10 pontos, é eliminado.'
                    ],
                    detailed: [
                        'Joguem 2 a 4 pessoas num tabuleiro de 12×12 ou 16×16. O Vermelho começa no canto superior esquerdo, o Azul no superior direito, o Verde no inferior direito e o Amarelo no inferior esquerdo.',
                        'Na configuração normal, cada jogador selecionado começa com um castelo-Torre que contém 12 unidades: um Rei, uma Dama, duas Torres, dois Bispos, dois Cavalos e quatro Peões. Cada outra província tem uma Torre rebelde imóvel com um Peão na guarnição e outro Peão rebelde no exterior. Os rebeldes não jogam turnos.',
                        'O tabuleiro está dividido em 16 províncias. Uma província pertence a um jogador quando todas as Torres nela pertencem a esse jogador; a cor muda com a posse dos castelos. Províncias vazias, rebeldes ou disputadas são neutras. Derrotar rebeldes pode recrutar os seus sobreviventes que não sejam Torres.',
                        'Escolha 8 recursos (padrão: províncias rebeldes menos quatro, no mínimo zero) ou 12 recursos (todas as províncias rebeldes). Com 12 províncias rebeldes, as listas são 1 cavalo, 3 alimentos, 2 madeiras, 1 metal e 1 ouro, ou 2 cavalos, 4 alimentos, 3 madeiras, 2 metais e 1 ouro. Com outro número de províncias, as proporções são ajustadas. Os mapas personalizados usam as suas províncias rebeldes existentes.',
                        'A opção de permitir recursos nas capitais inclui províncias dos jogadores no sorteio, sem aumentar o total nem garantir recursos nas capitais. Está sempre ativa com 16 recursos e funciona com o equilíbrio por quadrante. Em mapas personalizados, as províncias vazias ou disputadas continuam excluídas nos modos 8/12; o total continua a depender das províncias exclusivamente rebeldes.',
                        'Por padrão, cada recurso provincial recebe uma probabilidade aleatória fixa de produção entre 5% e 95%, indicada na descrição ao passar o cursor. O equilíbrio opcional faz com que as probabilidades em cada quadrante de canto ocupado (2×2 províncias) somem 25%, com um mínimo de 5% por recurso. Pode permitir quadrantes vazios ou exigir pelo menos um recurso em cada quadrante; esta última opção requer províncias elegíveis suficientes. Não há números de produção. Após as rondas 4, 8, 12, etc., cada província elegível faz um sorteio independente para dar um recurso ao proprietário atual; todos os recursos podem produzir ou falhar. Províncias rebeldes, vazias, disputadas ou de jogadores inativos ou eliminados não produzem. Os ícones evitam montanhas e continuam visíveis sob a neblina. As probabilidades mantêm-se após conquistas. As reservas começam a zero, acumulam sem limite e aparecem em privado como ícones e quantidades no cartão do jogador.',
                        'Cada jogador tem uma lista privada de objetivos escolhidos aleatoriamente. Nas configurações normais geradas, a semente recria as posições iniciais, os portões das Torres, os níveis iniciais e o terreno. Nas configurações personalizadas, o posicionamento e os níveis escolhidos mantêm-se; a semente gera o terreno e os portões. Os objetivos e os resultados dos combates continuam aleatórios.',
                        'A pontuação é verificada no fim de cada ronda, incluindo as baixas dos cercos e o regresso das unidades. Os jogadores com −10 pontos ou menos são eliminados em simultâneo; só depois são atribuídos os pontos por derrotar inimigos. Chegue aos 10 pontos para vencer. Se houver vários vencedores na mesma ronda, partilham a vitória. Se todos forem eliminados, há empate.',
                        'A morte do Rei não elimina automaticamente o jogador. Ser o último sobrevivente também não garante a vitória.'
                    ]
                },
                {
                    title: '2. Planeie a ronda',
                    art: 'plans',
                    basic: [
                        'Na sua vez, escolha as peças que quer mover e planeie as jogadas.',
                        'Clique ou toque numa das suas peças e depois numa casa adjacente para escolher o destino.',
                        'As jogadas ficam ocultas dos adversários até todos confirmarem os planos.',
                        'Use «Reiniciar planos» para os apagar e «Confirmar planos» para os bloquear.'
                    ],
                    detailed: [
                        'Em cada ronda, pode mover nenhuma, uma ou várias peças sobreviventes. No modo Hotseat, passe o dispositivo ao jogador seguinte. No modo Multijogador, cada pessoa planeia no seu próprio dispositivo.',
                        'Os planos ficam ocultos dos outros jogadores. No modo Multijogador, o anfitrião pode consultar os planos enviados; os convidados só veem os seus. Cada jogador pode desbloquear o próprio plano confirmado até o último jogador confirmar. O anfitrião resolve a ronda.',
                        'Primeiro são resolvidas as decisões já planeadas de libertar ou executar prisioneiros. Em seguida, as peças saem das casas de origem, resolvem-se as trocas entre inimigos, juntam-se as peças aliadas que chegam à mesma casa e combatem os grupos inimigos restantes.',
                        'Pode haver combate quando inimigos se dirigem para a mesma casa, cruzam caminhos ou atacam um inimigo que ficou parado. As peças aliadas não se interceptam.',
                        'Use as setas coloridas para rever os planos: verde para movimento, amarelo para junções, vermelho para possíveis combates e azul para transferências. «Reiniciar planos» apaga apenas os seus planos; «Confirmar planos» bloqueia-os. No modo Hotseat, aparece um ecrã de privacidade entre jogadores.',
                        'A janela de combate pausa a resolução: prima «Iniciar combate» para lançar os dados e «Prosseguir» depois de consultar o resultado. Expanda «Lançamentos» ou toque em ⓘ para ver os dados e as regras; passe o cursor ou toque nas unidades e estatísticas para consultar probabilidades, baixas e bónus. Pode ocultar e voltar a mostrar o registo de combate sem apagar entradas.'
                    ]
                },
                {
                    title: '3. Movimento e grupos',
                    art: 'movement',
                    basic: [
                        'A maioria das peças avança exatamente uma casa em qualquer direção, incluindo na diagonal.',
                        'Em geral, os Peões só podem mover-se ou agir nas rondas ímpares: 1, 3, 5 e assim sucessivamente.',
                        'As Torres não se movem. Use a entrada assinalada pela seta para entrar ou sair.'
                    ],
                    detailed: [
                        'Peões, Cavalos, Bispos, Damas e Reis avançam exatamente uma casa em qualquer uma das oito direções. Não é possível entrar em casas de montanha.',
                        'Nas rondas pares, os Peões não podem iniciar movimentos, ataques, junções, separações ou transferências. Um grupo com um Peão não pode mover-se em conjunto numa ronda par, mas as unidades que não são Peões podem separar-se, mover-se ou ser transferidas. Também podem juntar-se ao grupo.',
                        'Um assalto de cerco já preparado e uma saída da Torre para combater podem ocorrer numa ronda par. Um cerco novo só pode começar numa ronda ímpar.',
                        'As Torres e os grupos liderados por uma Torre não se movem. Cada Torre tem uma única entrada, escolhida aleatoriamente e assinalada por uma seta. As junções, transferências, separações e os cercos têm de usar a casa junto dessa entrada. As Torres começam afastadas pelo menos duas casas umas das outras, também na diagonal.'
                    ]
                },
                {
                    title: '4. Junte forças',
                    art: 'merge',
                    basic: [
                        'Mova uma peça para junto de outra aliada para juntar os grupos. As peças aliadas que planearem a mesma casa juntam-se automaticamente.',
                        'Um grupo pode mover-se em conjunto; também pode selecionar uma unidade para a separar do grupo.',
                        'As peças aliadas nunca combatem entre si.'
                    ],
                    detailed: [
                        'Ao mover uma peça para junto de outra aliada, escolha «Juntar» ou «Cancelar». Depois de confirmada a junção, as peças envolvidas ficam comprometidas nessa ronda. As peças aliadas planeadas para a mesma casa juntam-se automaticamente.',
                        'As peças aliadas que chegam juntas formam um grupo antes do combate. O tipo da peça resultante segue esta prioridade: Torre, Peão, Cavalo, Bispo, Rei e, por fim, Dama.',
                        'Selecione uma peça para planear os movimentos de todo o grupo. Clique com o botão direito do rato ou mantenha a peça premida para abrir a lista de unidades. Escolha uma unidade que se possa mover e, em seguida, uma casa adjacente para a separar. A transferência para outra peça aliada requer confirmação.',
                        'As Torres só recebem ou libertam unidades pela entrada assinalada. Os Peões e os prisioneiros estão sujeitos à regra das rondas ímpares.'
                    ]
                },
                {
                    title: '5. Combates e retiradas',
                    art: 'battle',
                    basic: [
                        'Quando os inimigos se encontram, o jogo compara as forças e determina o resultado com uma rolagem.',
                        'O vencedor também pode sofrer baixas. As unidades derrotadas podem ser capturadas; os restantes sobreviventes retiram-se.',
                        'As unidades retiradas regressam após três rondas, mas ficam Desorganizadas e combatem pior.'
                    ],
                    detailed: [
                        'O combate pode começar quando inimigos avançam para a mesma casa, cruzam caminhos ou atacam um inimigo que ficou parado. As peças aliadas que chegam juntas formam um grupo antes da luta.',
                        'Se algum grupo combatente tiver Peões, Torres ou Cavalos, apenas essas peças contam para o tamanho do grupo no escalão normal. Cada unidade contabilizada acima do maior grupo adversário acrescenta 20%; cada Rei dá +10% de moral e cada Dama ou Bispo +5%. Se todos os grupos tiverem apenas Reis, Damas e Bispos, todas as unidades contam para o tamanho e não se aplicam esses bónus de moral. A força é elevada à potência 1,35 antes da seleção ponderada.',
                        'A experiência e a armadura acrescentam cada uma 5% de força e reduzem em 5% por nível o risco de baixa da unidade (máximo de nível 3). Um grupo defensor imóvel com uma Torre e outras unidades combatentes multiplica por 3 o seu peso de combate. Uma Dama ou um Rei isolado que perca tem um risco base de baixa de 60% ou 75%, respetivamente, antes dos modificadores; o vencedor tem 50% de proteção contra baixas.',
                        'As unidades combatentes sobreviventes ganham um nível de experiência após cada combate, até ao nível 3. As unidades derrotadas são capturadas. Para as unidades de jogadores, o vencedor escolhe «Prisioneiro» ou «Executar»; os sobreviventes rebeldes que não sejam Torres são recrutados automaticamente. As baixas do vencedor morrem. Os outros sobreviventes derrotados retiram-se durante três rondas. Cada retirada acrescenta um nível de Desorganização (até três): −20% de força e +25 pontos percentuais de risco de baixa por nível. O efeito dura até ao fim da ronda de regresso e das cinco rondas seguintes. Juntar ou separar unidades não o remove.'
                    ]
                },
                {
                    title: '6. Prisioneiros',
                    art: 'prisoners',
                    basic: [
                        'As unidades capturadas tornam-se prisioneiras, a menos que o captor decida executá-las.',
                        'Os prisioneiros não combatem. Pode movê-los com as suas forças ou libertá-los.',
                        'Uma unidade libertada regressa ao jogador original após três rondas de reentrada.'
                    ],
                    detailed: [
                        'Os prisioneiros mantêm a cor e a aparência originais, com correntes da cor do captor. Pertencem ao captor, não podem atacar e não dão bónus de combate.',
                        'Os prisioneiros só podem mover-se, separar-se ou ser transferidos nas rondas ímpares. Podem juntar-se a grupos aliados ou a uma Torre pela entrada. Os grupos constituídos apenas por prisioneiros perdem sempre que são atacados; os seus membros são capturados, mas nunca mortos nem desorganizados em combate. Num grupo misto, os prisioneiros não sofrem baixas e ficam sob a custódia do vencedor.',
                        'Clique numa peça com prisioneiros, clique com o botão direito do rato ou mantenha-a premida para abrir a lista de unidades. Planeie «Executar» ou «Libertar» para um prisioneiro; «Reiniciar planos» anula essa decisão. As decisões são aplicadas antes dos movimentos, pelo que o resto do grupo ainda se pode mover.',
                        'As unidades libertadas regressam ao jogador original pelo sistema de reentrada de três rondas, sem penalização de Desorganização. Se não houver uma casa livre, aguardam; as unidades libertadas de jogadores eliminados ficam paradas. Os prisioneiros contam como vivos para os objetivos até serem executados. Se recuperar as suas unidades, estas voltam ao serviço normal.'
                    ]
                },
                {
                    title: '7. Terreno e visibilidade',
                    art: 'terrain',
                    basic: [
                        'As montanhas bloqueiam a passagem. As florestas escondem tropas; as florestas e colinas podem proteger quem defende.',
                        'Não consegue ver todos os inimigos. As suas províncias e as peças próximas revelam partes do mapa.',
                        'A neblina e as florestas ocultam informação no ecrã, mas não do anfitrião no modo Multijogador.'
                    ],
                    detailed: [
                        'Os mapas têm aproximadamente 50% de planícies, 20% de florestas, 20% de colinas e 10% de montanhas. Os castelos começam em planícies. As montanhas são intransponíveis e não podem ser usadas na reentrada de unidades retiradas.',
                        'Uma força que permanece numa floresta e é atacada recebe +25% de força. O mesmo bónus aplica-se a uma força que tenha permanecido na colina durante toda a ronda anterior. As forças que chegam nessa ronda e as trocas entre inimigos não recebem defesa do terreno. As planícies não têm efeito.',
                        'A sua visão abrange as suas províncias e as oito províncias vizinhas, incluindo as diagonais. Cada peça aliada revela uma área de 3×3; um grupo com um Bispo que não seja prisioneiro revela uma área de 5×5. A visão depende das posições e do controlo atuais dos castelos, não das jogadas planeadas.',
                        'As tropas inimigas e rebeldes fora da sua área de visão ficam ocultas. As Torres e as entradas continuam visíveis, mas as guarnições escondidas não. As tropas na floresta continuam ocultas mesmo quando a casa está à vista. Os combates revelam os participantes; o fim da partida revela o tabuleiro. A neblina é apenas visual, não garante sigilo na rede. As cores das províncias e o terreno continuam visíveis sob a neblina.',
                        'A pré-visualização mostra os castelos iniciais e o terreno. Numa configuração gerada, a semente recria as posições iniciais, os portões das Torres, os níveis iniciais e o terreno, mas não os objetivos nem os resultados dos combates. A geração tenta manter o terreno transitável ligado; configurações personalizadas muito ocupadas podem alterar as proporções.'
                    ]
                },
                {
                    title: '8. Cercos',
                    art: 'siege',
                    basic: [
                        'Um Peão pode iniciar um cerco a uma Torre inimiga em vez de combater de imediato.',
                        'A catapulta aguarda enquanto o contador do assalto diminui. Os defensores podem sair da Torre para combater.',
                        'Quando o contador da Torre chega a zero, a guarnição perde unidades uma a uma.'
                    ],
                    detailed: [
                        'Atacar uma Torre com pelo menos um Peão que não seja prisioneiro inicia um cerco em vez de um combate normal. Só é possível iniciar cercos em rondas ímpares. O Peão permanece na casa de origem como catapulta.',
                        'A catapulta tem um contador de assalto de três rondas. Quando está pronta, pode atacar a Torre adjacente, mesmo numa ronda par. A Torre cercada tem um contador de seis rondas. Quando chega a zero, perde uma unidade aleatória por ronda, exceto prisioneiros e Torres.',
                        'Uma Torre cercada não pode mover-se, juntar-se a outras peças, transferir unidades nem separar unidades para o exterior. Os defensores que não são Torres podem sair para combater se pelo menos um deles puder lutar, mesmo numa ronda par. Se a catapulta sobreviver, os defensores sobreviventes regressam à Torre; os derrotados são capturados.',
                        'Um cerco bem-sucedido conquista automaticamente a Torre. A própria Torre não participa nos contra-ataques.',
                        'Use «Cancelar cerco» na catapulta para a retirar. No modo Hotseat, o cancelamento é imediato; no Multijogador, é uma ação planeada que ocupa a catapulta nessa ronda. Se os defensores também planearem «Sair para combater», lutam na mesma contra a catapulta que está a cancelar o cerco.'
                    ]
                },
                {
                    title: '9. Objetivos e vitória',
                    art: 'score',
                    basic: [
                        'Consulte a sua lista privada de objetivos para saber como ganhar ou perder pontos.',
                        'Chegue aos 10 pontos para vencer. Com −10 pontos, é eliminado.',
                        'A morte do seu Rei afeta a pontuação, mas não termina automaticamente a partida.'
                    ],
                    detailed: [
                        'No início, são atribuídos objetivos aleatórios: +4 pela eliminação de um inimigo-alvo, +3 pela morte do Rei de um inimigo-alvo, +2 pela morte de uma Dama inimiga específica e +1 por controlar uma Torre ou castelo inimigo específico.',
                        'Penalizações: −4 se o seu Rei morrer e −3 por cada castelo inicial perdido. Os pontos do castelo são recuperados se voltar a controlá-lo. As unidades em retirada continuam vivas; os prisioneiros contam como vivos até serem executados.',
                        'A pontuação é atualizada no fim da ronda, incluindo as baixas dos cercos e as unidades que regressam. Os jogadores com −10 pontos ou menos são eliminados permanentemente em simultâneo. Depois, são atribuídos os pontos por derrotar inimigos.',
                        'Vence o primeiro jogador a chegar aos 10 pontos. Se houver vários vencedores na mesma ronda, partilham a vitória. Mesmo o último jogador tem de alcançar os 10 pontos. Se todos os jogadores ativos forem eliminados, há empate.'
                    ]
                },
                {
                    title: '10. Modos de jogo e preparação',
                    art: 'modes',
                    basic: [
                        'Hotseat: partilhem um dispositivo e passem-no ao jogador seguinte.',
                        'Multijogador: cada pessoa usa um navegador. O anfitrião cria uma sala e partilha o código.',
                        'Pode pré-visualizar o mapa ou posicionar as peças numa configuração personalizada.'
                    ],
                    detailed: [
                        'O modo Hotseat usa um único dispositivo. Cada jogador planeia em segredo antes de o passar ao seguinte. No modo Multijogador, cada pessoa usa um navegador; o anfitrião cria a sala, escolhe 2 a 4 jogadores e partilha o código de cinco letras.',
                        'O navegador do anfitrião mantém o estado oficial da partida e deve permanecer aberto. Os jogadores confirmam os planos e, depois da resolução, começa a ronda seguinte. Os convidados podem voltar a entrar com o código da sala no mesmo separador do navegador.',
                        'Antes de começar, escolha o tamanho do tabuleiro e os nomes dos jogadores. Gere uma pré-visualização para consultar a semente; numa configuração gerada, a semente recria as posições iniciais, os portões das Torres, os níveis e o terreno. No posicionamento personalizado, a semente controla o terreno e os portões, enquanto as posições e os níveis vêm da configuração escolhida.',
                        'Escolha a progressão das unidades: todas começam no nível 0 ou cada uma recebe níveis aleatórios de experiência e armadura entre 1 e 3. No modo Hotseat, escolha posições aleatórias ou personalizadas. O posicionamento personalizado substitui as forças geradas e os rebeldes: posicione peças em qualquer casa, junte peças do mesmo jogador, guarde/carregue configurações ou reinicie. Cada jogador selecionado precisa de exatamente um Rei, pelo menos uma Dama e uma Torre. As Torres têm de ficar afastadas pelo menos duas casas em todas as direções, incluindo na diagonal.',
                        'No modo Multijogador, o anfitrião escolhe o tabuleiro, o número de jogadores, a progressão, a semente e as posições iniciais. Para uma configuração personalizada, use «Posicionar peças / Carregar configuração» e depois «Usar posicionamento» para voltar à sala; a configuração tem de corresponder aos jogadores da sala. Todos têm de estar ligados para o anfitrião iniciar a partida.',
                        'Durante a partida, use «Nomes» para alterar os nomes (no Multijogador, cada pessoa só pode alterar o seu). Os cartões mostram o estado, as unidades em retirada e as baixas; o painel privado mostra apenas os seus objetivos e pontuação. «Menu» volta à seleção do modo; «Novo jogo»/«Jogar novamente» inicia outra preparação, mas só o anfitrião pode reiniciar a sala Multijogador. O anfitrião pode ignorar jogadores desligados; os jogadores eliminados tornam-se espetadores e deixam de ter de planear.'
                    ]
                },
                {
                    title: '11. Progressão e controlos',
                    art: 'battle',
                    basic: [
                        'As unidades ganham experiência ao sobreviverem a combates. Pode melhorar a armadura a partir de um grupo com Torre.',
                        'Use a lista de unidades para gerir unidades individuais, prisioneiros, cercos e melhorias.',
                        'Consulte os cartões dos jogadores, os objetivos privados, a semente do mapa e o registo de combate.'
                    ],
                    detailed: [
                        'Cada unidade não prisioneira que sobreviva a um combate ganha um nível de experiência, até ao nível 3. Cada nível acrescenta 5% de força e reduz em 5% o risco de baixa da unidade. Nas opções de preparação, também pode escolher níveis iniciais aleatórios de experiência e armadura entre 1 e 3.',
                        'Durante o planeamento, clique com o botão direito do rato numa peça aliada ou mantenha-a premida durante 500 ms para abrir a lista de unidades. Uma unidade num grupo que contenha uma Torre pode receber uma melhoria de armadura através do botão de escudo, até ao nível 3; cada nível acrescenta 5% de força e reduz em 5% o risco de baixa. No Multijogador, as melhorias são aplicadas pelo anfitrião.',
                        'Clique ou toque numa peça aliada e depois numa casa adjacente para agir. Selecione uma unidade da lista para a mover separadamente ou transferi-la. As peças com prisioneiros mostram as ações «Executar» e «Libertar»; catapultas e Torres cercadas mostram as ações de cerco. «Reiniciar planos» anula movimentos, ações de cerco e decisões sobre prisioneiros, mas não anula melhorias de armadura já aplicadas.',
                        'A lista de objetivos é privada e fica oculta durante a passagem do dispositivo no modo Hotseat e durante a resolução. Altere os nomes em «Nomes», acima do tabuleiro. O registo de combate pode ser recolhido sem perder entradas. Os cartões de combate mostram probabilidades, origem dos bónus, baixas, escolhas sobre capturas e lançamentos.'
                    ]
                }
            ],
        }
    };

    let language = 'en';
    let level = 'basic';
    let activeChapter = 0;
    const chapterNav = document.getElementById('rules-chapters');
    const content = document.getElementById('rules-content');

    function illustration(art, lang) {
        const pt = lang === 'pt';
        const labels = pt ? {
            board: ['Quatro cantos de início', 'Objetivo: 10 pontos'],
            plans: ['Cada jogador planeia', 'Planos secretos', 'Todos confirmam', 'Resolução simultânea'],
            movement: ['1 casa por jogada', 'Oito direções', 'Peões: rondas ímpares', 'Torre: imóvel'],
            merge: ['Peça aliada', 'Movimento planeado', 'Um grupo', 'Juntam-se antes do combate'],
            battle: ['Forças inimigas', 'Combate', 'Vencedor', 'Baixas capturadas', 'Outros derrotados retiram-se'],
            prisoners: ['Capturado', 'Sob custódia', 'Libertar', 'Executar'],
            terrain: ['Planície: sem bónus', 'Floresta: defesa +25%', 'Colina: defesa +25% se já ocupada', 'Montanha: intransponível'],
            siege: ['Peão inicia o cerco', 'Assalto pronto em 3 rondas', 'Torre: contador 6', 'Sem guarnição: conquista'],
            score: ['−10: eliminado', 'Objetivos alteram a pontuação', '+10: vitória'],
            modes: ['Hotseat: um dispositivo', 'Multijogador: um dispositivo por jogador', 'Configuração: posicione as peças']
        } : {
            board: ['Four starting corners', 'Goal: 10 points'],
            plans: ['Each player plans', 'Plans stay secret', 'Everyone commits', 'Resolve simultaneously'],
            movement: ['1 square per move', 'Eight directions', 'Pawns: odd rounds', 'Tower: stationary'],
            merge: ['Friendly piece', 'Planned move', 'One stack', 'Join before combat'],
            battle: ['Enemy forces', 'Battle', 'Winner', 'Casualties captured', 'Other defeated units retreat'],
            prisoners: ['Captured', 'Held by captor', 'Release', 'Execute'],
            terrain: ['Plains: no bonus', 'Forest: +25% defence', 'Hill: +25% if held last round', 'Mountain: impassable'],
            siege: ['Pawn starts siege', 'Assault ready in 3 rounds', 'Tower: 6-count timer', 'No garrison: conquered'],
            score: ['−10: eliminated', 'Objectives change score', '+10: victory'],
            modes: ['Hotseat: one device', 'Multiplayer: one device each', 'Setup: place your pieces']
        };
        const colors = { red: '#ef4444', blue: '#3b82f6', green: '#10b981', yellow: '#facc15' };
        const title = (text, x, y) =>
            `<text x="${x}" y="${y}" text-anchor="middle" fill="#f8fafc" font-size="13" font-weight="700">${text}</text>`;
        const note = (text, x, y, anchor = 'middle', size = 11) =>
            `<text x="${x}" y="${y}" text-anchor="${anchor}" fill="#cbd5e1" font-size="${size}">${text}</text>`;
        const arrow = (x1, y1, x2, y2, color = '#cbd5e1') =>
            `<path d="M${x1} ${y1} L${x2} ${y2}" fill="none" stroke="${color}" stroke-width="2" marker-end="url(#guide-arrow)"/>`;
        const node = (x, y, label, fill = '#334155', width = 110) =>
            `<rect x="${x}" y="${y}" width="${width}" height="38" rx="7" fill="${fill}"/>
             <text x="${x + width / 2}" y="${y + 24}" text-anchor="middle" fill="white" font-size="11" font-weight="700">${label}</text>`;
        let label;
        let drawing;
        switch (art) {
            case 'board': {
                label = labels.board.join('. ');
                const cells = Array.from({ length: 16 }, (_, i) =>
                    `<rect x="${20 + (i % 4) * 30}" y="${16 + Math.floor(i / 4) * 30}" width="30" height="30"
                        fill="${(i + Math.floor(i / 4)) % 2 ? '#475569' : '#1e293b'}"/>`).join('');
                drawing = `<rect x="19" y="15" width="122" height="122" fill="#0f172a"/>${cells}
                    <circle cx="29" cy="25" r="7" fill="${colors.red}"/><circle cx="131" cy="25" r="7" fill="${colors.blue}"/>
                    <circle cx="29" cy="127" r="7" fill="${colors.yellow}"/><circle cx="131" cy="127" r="7" fill="${colors.green}"/>
                    ${note(pt ? 'Vermelho' : 'Red', 175, 39, 'start')}${note(pt ? 'Azul' : 'Blue', 175, 62, 'start')}
                    ${note(pt ? 'Amarelo' : 'Yellow', 175, 85, 'start')}${note(pt ? 'Verde' : 'Green', 175, 108, 'start')}
                    ${title(pt ? 'Objetivo de pontuação' : 'Score objective', 345, 45)}<text x="345" y="94" text-anchor="middle" fill="#34d399" font-size="42" font-weight="800">10</text>
                    ${note(pt ? 'pontos para vencer' : 'points to win', 345, 117)}`;
                break;
            }
            case 'plans': {
                label = labels.plans.join('. ');
                const rows = [
                    { y: 34, color: colors.red, name: pt ? 'Vermelho' : 'Red' },
                    { y: 70, color: colors.blue, name: pt ? 'Azul' : 'Blue' },
                    { y: 106, color: colors.green, name: pt ? 'Verde' : 'Green' }
                ].map(row => `<circle cx="34" cy="${row.y + 10}" r="8" fill="${row.color}"/>
                    ${note(row.name, 50, row.y + 14, 'start')}${arrow(105, row.y + 10, 139, row.y + 10, row.color)}
                    ${node(145, row.y - 7, pt ? 'Plano secreto' : 'Secret plan', '#334155', 100)}
                    ${arrow(250, row.y + 10, 303, 70)}`
                ).join('');
                drawing = `${rows}${node(310, 51, pt ? 'Resolver' : 'Resolve', '#4f46e5', 105)}
                    ${note(pt ? 'Todos ao mesmo tempo' : 'Everyone at once', 362, 111)}`;
                break;
            }
            case 'movement': {
                label = labels.movement.join('. ');
                const directions = [[84, 36], [126, 36], [168, 36], [84, 78], [168, 78], [84, 120], [126, 120], [168, 120]];
                const cells = Array.from({ length: 9 }, (_, i) =>
                    `<rect x="${64 + (i % 3) * 42}" y="${30 + Math.floor(i / 3) * 42}" width="40" height="40"
                        fill="${(i + Math.floor(i / 3)) % 2 ? '#475569' : '#1e293b'}"/>`).join('');
                const moves = directions.map(([x, y]) => arrow(126, 78, x, y, '#34d399')).join('');
                drawing = `<rect x="63" y="29" width="126" height="126" fill="#0f172a"/>${cells}${moves}
                    <circle cx="126" cy="78" r="12" fill="${colors.yellow}"/><text x="126" y="83" text-anchor="middle" fill="#111827" font-size="14">P</text>
                    ${note(labels.movement[0], 290, 47, 'start')}${note(labels.movement[1], 290, 68, 'start')}
                    ${note(labels.movement[2], 290, 102, 'start')}${note(labels.movement[3], 290, 123, 'start')}`;
                break;
            }
            case 'merge':
                label = labels.merge.join('. ');
                drawing = `<circle cx="63" cy="66" r="19" fill="${colors.red}"/><text x="63" y="71" text-anchor="middle" fill="white" font-size="13">P</text>
                    <circle cx="63" cy="112" r="19" fill="${colors.red}"/><text x="63" y="117" text-anchor="middle" fill="white" font-size="13">H</text>
                    ${note(labels.merge[0], 63, 26)}${arrow(88, 66, 151, 87, colors.red)}${arrow(88, 112, 151, 91, colors.red)}
                    <rect x="158" y="57" width="76" height="66" rx="9" fill="#7f1d1d" stroke="${colors.red}" stroke-width="2"/>
                    <text x="196" y="84" text-anchor="middle" fill="white" font-size="14">P + H</text>
                    ${note(labels.merge[2], 196, 103)}${arrow(246, 90, 290, 90)}
                    ${node(300, 71, pt ? 'Um grupo' : 'One stack', '#334155', 120)}
                    ${note(labels.merge[3], 365, 132)}`;
                break;
            case 'battle':
                label = labels.battle.join('. ');
                drawing = `<rect x="22" y="52" width="82" height="56" rx="8" fill="#7f1d1d" stroke="${colors.red}"/>
                    <text x="63" y="76" text-anchor="middle" fill="white" font-size="12">P + H</text>${note(pt ? 'Força 2' : 'Strength 2', 63, 96)}
                    <rect x="376" y="52" width="82" height="56" rx="8" fill="#1e3a8a" stroke="${colors.blue}"/>
                    <text x="417" y="76" text-anchor="middle" fill="white" font-size="12">P</text>${note(pt ? 'Força 1' : 'Strength 1', 417, 96)}
                    ${arrow(111, 80, 183, 80, colors.red)}${arrow(369, 80, 297, 80, colors.blue)}
                    <circle cx="240" cy="80" r="31" fill="#92400e" stroke="#f59e0b" stroke-width="2"/>
                    <text x="240" y="86" text-anchor="middle" fill="white" font-size="20">⚔</text>
                    ${note(labels.battle[2], 240, 29)}${arrow(240, 114, 139, 137, '#f59e0b')}${arrow(240, 114, 341, 137, '#64748b')}
                    ${note(labels.battle[3], 123, 145)}${note(pt ? 'Outros derrotados' : 'Other defeated', 358, 145)}
                    ${note(pt ? 'retiram-se' : 'retreat', 358, 158)}`;
                break;
            case 'prisoners':
                label = labels.prisoners.join('. ');
                drawing = `<circle cx="65" cy="75" r="25" fill="#7f1d1d" stroke="${colors.red}" stroke-width="2"/>
                    <text x="65" y="81" text-anchor="middle" fill="white" font-size="20">P</text>
                    ${note(labels.prisoners[0], 65, 119)}${arrow(94, 75, 156, 75)}
                    <rect x="162" y="48" width="115" height="54" rx="9" fill="#334155" stroke="#94a3b8"/>
                    <text x="219" y="70" text-anchor="middle" fill="white" font-size="18">⛓ P</text>
                    ${note(labels.prisoners[1], 219, 91)}${arrow(283, 75, 330, 47, '#34d399')}${arrow(283, 75, 330, 105, '#ef4444')}
                    ${node(337, 25, labels.prisoners[2], '#065f46', 110)}${node(337, 88, labels.prisoners[3], '#7f1d1d', 110)}`;
                break;
            case 'terrain': {
                label = labels.terrain.join('. ');
                const terrains = [
                    { x: 17, symbol: '·', color: '#a3a3a3', name: pt ? 'Planície' : 'Plains', effect: pt ? 'sem bónus' : 'no bonus' },
                    { x: 135, symbol: '♣', color: '#22c55e', name: pt ? 'Floresta' : 'Forest', effect: pt ? 'defesa +25%' : '+25% defence' },
                    { x: 253, symbol: '▲', color: '#f59e0b', name: pt ? 'Colina' : 'Hill', effect: pt ? 'defesa +25%' : '+25% defence',
                        condition: pt ? 'na ronda anterior' : 'held last round' },
                    { x: 371, symbol: '■', color: '#cbd5e1', name: pt ? 'Montanha' : 'Mountain', effect: pt ? 'intransponível' : 'impassable' }
                ];
                drawing = terrains.map((item, i) => `<rect x="${item.x}" y="31" width="92" height="54" rx="7" fill="#1e293b" stroke="${item.color}"/>
                    <text x="${item.x + 46}" y="67" text-anchor="middle" fill="${item.color}" font-size="25">${item.symbol}</text>
                    ${note(item.name, item.x + 46, 100)}${note(item.effect, item.x + 46, 117)}
                    ${item.condition ? note(item.condition, item.x + 46, 132, 'middle', 9) : ''}`).join('');
                break;
            }
            case 'siege':
                label = labels.siege.join('. ');
                drawing = `<circle cx="50" cy="80" r="23" fill="#7f1d1d" stroke="${colors.red}" stroke-width="2"/>
                    <text x="50" y="86" text-anchor="middle" fill="white" font-size="17">P</text>
                    ${note(labels.siege[0], 50, 124)}${arrow(78, 80, 137, 80, '#f59e0b')}
                    <rect x="144" y="55" width="72" height="50" rx="8" fill="#78350f" stroke="#f59e0b"/>
                    <text x="180" y="85" text-anchor="middle" fill="white" font-size="23">✹</text>
                    ${note(labels.siege[1], 180, 124)}${arrow(222, 80, 280, 80, '#f59e0b')}
                    <rect x="289" y="37" width="78" height="85" rx="8" fill="#334155" stroke="#94a3b8" stroke-width="2"/>
                    <path d="M300 37 V24 H356 V37 M315 122 V91 H341 V122" fill="none" stroke="#94a3b8" stroke-width="4"/>
                    <text x="328" y="75" text-anchor="middle" fill="#f8fafc" font-size="17">6 → 0</text>
                    ${note(labels.siege[2], 328, 142)}${arrow(373, 80, 408, 80, '#ef4444')}
                    ${node(408, 61, pt ? 'Conquista' : 'Conquered', '#065f46', 65)}`;
                break;
            case 'score':
                label = labels.score.join('. ');
                drawing = `<rect x="28" y="41" width="110" height="54" rx="8" fill="#7f1d1d"/>
                    <text x="83" y="76" text-anchor="middle" fill="white" font-size="22" font-weight="700">−10</text>
                    ${note(labels.score[0], 83, 119)}${arrow(145, 68, 194, 68, '#cbd5e1')}
                    <rect x="201" y="41" width="110" height="54" rx="8" fill="#334155"/>
                    <text x="256" y="76" text-anchor="middle" fill="white" font-size="22">+ / −</text>
                    ${note(labels.score[1], 256, 119)}${arrow(318, 68, 366, 68, '#34d399')}
                    <rect x="373" y="41" width="78" height="54" rx="8" fill="#065f46"/>
                    <text x="412" y="76" text-anchor="middle" fill="white" font-size="22" font-weight="700">+10</text>
                    ${note(labels.score[2], 412, 119)}`;
                break;
            case 'modes':
                label = labels.modes.join('. ');
                drawing = `<rect x="25" y="28" width="112" height="74" rx="9" fill="#1e293b" stroke="#6366f1" stroke-width="2"/>
                    <rect x="35" y="38" width="92" height="48" rx="4" fill="#0f172a"/>
                    <circle cx="64" cy="61" r="9" fill="${colors.red}"/><circle cx="98" cy="61" r="9" fill="${colors.blue}"/>
                    ${note(labels.modes[0], 81, 124)}${arrow(143, 65, 179, 65)}
                    <rect x="187" y="30" width="55" height="64" rx="5" fill="#1e293b" stroke="${colors.green}" stroke-width="2"/>
                    <rect x="253" y="30" width="55" height="64" rx="5" fill="#1e293b" stroke="${colors.blue}" stroke-width="2"/>
                    <rect x="198" y="40" width="33" height="39" fill="#0f172a"/><rect x="264" y="40" width="33" height="39" fill="#0f172a"/>
                    ${note(labels.modes[1], 247, 124)}${arrow(314, 65, 348, 65)}
                    <rect x="359" y="35" width="82" height="60" fill="#0f172a" stroke="#94a3b8"/>
                    <path d="M379 35 V95 M400 35 V95 M421 35 V95 M359 55 H441 M359 75 H441" stroke="#475569"/>
                    <circle cx="369" cy="45" r="5" fill="${colors.red}"/><circle cx="431" cy="85" r="5" fill="${colors.blue}"/>
                    ${note(labels.modes[2], 400, 124)}`;
                break;
            default:
                return '';
        }
        return `<svg class="rules-illustration" viewBox="0 0 480 160" role="img" aria-label="${label}">
            <title>${label}</title>
            <defs><marker id="guide-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                <path d="M0,0 L0,6 L6,3 z" fill="#cbd5e1"/>
            </marker></defs>${drawing}</svg>`;
    }

    function render() {
        const text = guide[language];
        const chapters = text.chapters;
        activeChapter = Math.min(activeChapter, chapters.length - 1);
        document.getElementById('rules-modal').lang = language === 'pt' ? 'pt-PT' : 'en';
        document.getElementById('rules-title').textContent = text.title;
        document.getElementById('rules-subtitle').textContent = text.subtitle;
        document.getElementById('btn-ack-rules').textContent = text.close;
        document.getElementById('btn-close-rules').setAttribute('aria-label',
            language === 'pt' ? 'Fechar as regras' : 'Close rules');
        document.getElementById('rules-page-hint').textContent =
            text.page(activeChapter + 1, chapters.length);
        document.querySelector('[data-rules-level="basic"]').textContent = text.basic;
        document.querySelector('[data-rules-level="detailed"]').textContent = text.detailed;
        document.querySelector('#rules-chapters').setAttribute('aria-label', text.chaptersLabel);
        document.querySelectorAll('[data-rules-language]').forEach(button => {
            button.setAttribute('aria-pressed', String(button.dataset.rulesLanguage === language));
        });
        document.querySelectorAll('[data-rules-level]').forEach(button => {
            button.setAttribute('aria-pressed', String(button.dataset.rulesLevel === level));
        });

        chapterNav.innerHTML = chapters.map((chapter, index) =>
            `<button class="rules-chapter" type="button" data-chapter="${index}" aria-current="${index === activeChapter}">
                ${chapter.title}
            </button>`
        ).join('');
        const chapter = chapters[activeChapter];
        const bullets = chapter[level].map(item => `<li>${item}</li>`).join('');
        const takeAway = language === 'pt' ? 'Em resumo' : 'Remember';
        content.innerHTML = `<h4>${chapter.title}</h4>
            ${illustration(chapter.art, language)}
            <ul>${bullets}</ul>
            <p class="rules-callout"><strong>${takeAway}:</strong> ${chapter.basic[chapter.basic.length - 1]}</p>`;
    }

    document.querySelectorAll('[data-rules-language]').forEach(button => {
        button.addEventListener('click', () => {
            language = button.dataset.rulesLanguage;
            render();
        });
    });
    document.querySelectorAll('[data-rules-level]').forEach(button => {
        button.addEventListener('click', () => {
            level = button.dataset.rulesLevel;
            activeChapter = 0;
            render();
        });
    });
    chapterNav.addEventListener('click', event => {
        const button = event.target.closest('[data-chapter]');
        if (!button) return;
        activeChapter = Number(button.dataset.chapter);
        render();
        content.focus();
    });
    render();
})();
