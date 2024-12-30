export const WORLD_GUIDE = `
<WORLD_GUIDE>
  <CONTRACT_ADDRESSES>
    eternum-trade_systems: 0x1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF
    eternum-building_systems: 0x36b82076142f07fbd8bf7b2cabf2e6b190082c0b242c6ecc5e14b2c96d1763c
  </CONTRACT_ADDRESSES>

  <INSTRUCTIONS>
    <BUYING_RESOURCES>
      1. Look at the market data -> fetch with eternum_Orders
      2. Then accept an order with the correct eternum_AcceptOrder model
    </BUYING_RESOURCES>

    <BUILDING_CONSTRUCTION>
      1. Check what buildings you have with eternum_Building and locations
      2. If you don't have the building, check the cost with eternum_BuildingCost passing in the building id
      3. If you have enough resources, use eternum_CreateBuilding to build the building
    </BUILDING_CONSTRUCTION>
  </INSTRUCTIONS>

  <BUILDING_COSTS>
    Market: 750000 Fish, 125000 Stone, 50000 Obsidian, 25000 Ruby, 5000 DeepCrystal
    Barracks: 1000000 Wheat, 75000 Wood, 75000 Coal, 50000 Silver, 45000 Gold
    Archery Range: 1000000 Fish, 75000 Wood, 75000 Obsidian, 25000 Gold, 25000 Hartwood
    Stable: 1000000 Wheat, 75000 Wood, 75000 Silver, 35000 Ironwood, 25000 Gold
    Workers Hut: 300000 Wheat, 75000 Stone, 75000 Wood, 75000 Coal
    Storehouse: 1000000 Fish, 75000 Coal, 75000 Stone, 10000 Sapphire
    Farm: 450000 Fish
    Fishing Village: 450000 Wheat
  </BUILDING_COSTS>

  <BUILDING_POPULATION>
    None: 0
    Castle: 0
    Bank: 0
    Fragment Mine: 0
    Resource: 2
    Farm: 1
    Fishing Village: 1
    Barracks: 2
    Market: 3
    Archery Range: 2
    Stable: 3
    Trading Post: 2
    Workers Hut: 0
    Watch Tower: 2
    Walls: 2
    Storehouse: 2
  </BUILDING_POPULATION>

  <REALM_LEVELS>
    <SETTLEMENT level="1">
      6 buildable hexes - starting realm level
    </SETTLEMENT>
    
    <CITY level="2">
      18 buildable hexes
      Requires: 3000k Wheat and 3000k Fish
    </CITY>
    
    <KINGDOM level="3">
      Requires:
      - 600k ColdIron
      - 600k Hartwood  
      - 600k Diamonds
      - 600k Sapphire
      - 600k DeepCrystal
      - 5000k Wheat
      - 5000k Fish
    </KINGDOM>

    <EMPIRE level="4">
      Requires:
      - 50k AlchemicalSilver
      - 50k Adamantine
      - 50k Mithral 
      - 50k Dragonhide
      - 9000k Wheat
      - 9000k Fish
    </EMPIRE>
  </REALM_LEVELS>

  <RESOURCE_IDS>
    Stone = 1,
    Coal = 2,
    Wood = 3,
    Copper = 4,
    Ironwood = 5,
    Obsidian = 6,
    Gold = 7,
    Silver = 8,
    Mithral = 9,
    AlchemicalSilver = 10,
    ColdIron = 11,
    DeepCrystal = 12,
    Ruby = 13,
    Diamonds = 14,
    Hartwood = 15,
    Ignium = 16,
    TwilightQuartz = 17,
    TrueIce = 18,
    Adamantine = 19,
    Sapphire = 20,
    EtherealSilica = 21,
    Dragonhide = 22,
    AncientFragment = 29,
    Donkey = 249,
    Knight = 250,
    Crossbowman = 251,
    Paladin = 252,
    Lords = 253,
    Wheat = 254,
    Fish = 255
  </RESOURCE_IDS>

  <BUILDING_DESCRIPTIONS>
    Castle: Where the heart of your realm beats, the Castle is the foundation of your kingdom.
    Bank: Banks, where the wealth of the land flows, store the riches of your realm.
    Fragment Mine: Fragment Mines, where the earth's magic is harnessed, produce Ancient Fragments.
    Resource: Resource buildings, harnessing the land's magic, produce essential resources.
    Farm: Enchanted Farms, blessed by Gaia, yield golden wheat.
    Fishing Village: Mystical Fishing Villages, guided by the Moon, harvest the bounty of the seas of Fish
    Barracks: Barracks, where valor and magic intertwine, train noble Knights.
    Market: Markets, bustling with arcane traders, summon Donkeys for mystical trading.
    Archery Range: Archery Ranges, under the watchful eyes of elven masters, train Crossbow men.
    Stable: Stables, infused with ancient spirits, summon valiant Paladins.
    Trading Post: Trading Posts, at the crossroads of destiny, expand the horizons of trade.
    Workers Hut: Workers Huts, blessed by the ancestors, expand the heart of your realm allowing for greater capacity.
    Watch Tower: Watch Towers, piercing the veils of fog, extend the gaze of your kingdom.
    Walls: Walls, imbued with the strength of titans, fortify your domain against the shadows.
    Storehouse: Storehouses, where abundance flows, swell with the wealth of the land.
  </BUILDING_DESCRIPTIONS>

  <BUILDING_TYPES>
    None = 0
    Castle = 1
    Resource = 2
    Farm = 3
    Fishing Village = 4
    Barracks = 5
    Market = 6
    Archery Range = 7
    Stable = 8
    Trading Post = 9
    Workers Hut = 10
    Watch Tower = 11
    Walls = 12
    Storehouse = 13
    Bank = 14
    Fragment Mine = 15
  </BUILDING_TYPES>
</WORLD_GUIDE>`;

export const AVAILABLE_QUERIES = `
<QUERY_GUIDE>
  <OVERVIEW>
    This guide helps you query information about the Eternum game using GraphQL. Follow the structured approach below to build effective queries.
  </OVERVIEW>

  <QUICK_START>
    1. Find the realm's entity_id using the realm_id
    2. Get the realm's position (x, y coordinates)
    3. Query specific information using the entity_id and coordinates
  </QUICK_START>

  <COMMON_QUERIES>
    <REALM_INFO>
      <DESCRIPTION>Use this to find a realm's entity_id and level:</DESCRIPTION>
      <QUERY>
        query GetRealmInfo {
          s0_eternum_Realm(where: { realm_id: <realm_id> }) {
            edges {
              node {
                ... on eternum_Realm {
                  entity_id
                  level
                }
              }
            }
          }
        }
      </QUERY>
    </REALM_INFO>

    <REALM_POSITION>
      <DESCRIPTION>After getting the entity_id, find the realm's coordinates:</DESCRIPTION>
      <QUERY>
        query GetRealmPosition {
          s0EternumPositionModels(where: { entity_id: <entity_id> }, limit: 1) {
            edges {
              node {
                ... on eternum_Position {
                  x
                  y
                }
              }
            }
          }
        }
      </QUERY>
    </REALM_POSITION>

    <REALM_DETAILS>
      <DESCRIPTION>Query both resources and buildings in one call:</DESCRIPTION>
      <QUERY>
        query GetRealmDetails {
          s0EternumResourceModels(where: { entity_id: <entity_id> }, limit: 100) {
            edges {
              node {
                ... on eternum_Resource {
                  resource_type
                  balance
                }
              }
            }
          }
          s0EternumBuildingModels(where: { outer_col: <x>, outer_row: <y> }) {
            edges {
              node {
                ... on eternum_Building {
                  category
                  entity_id
                  inner_col
                  inner_row
                }
              }
            }
          }
        }
      </QUERY>
    </REALM_DETAILS>
  </COMMON_QUERIES>

  <SCHEMA_INTROSPECTION>
    <DESCRIPTION>To explore available fields for any model:</DESCRIPTION>
    <QUERY>
      query IntrospectModel {
        __type(name: <model_name>) {
          name
          fields {
            name
            type {
              name
              kind
              ofType {
                name
                kind
              }
            }
          }
        }
      }
    </QUERY>
  </SCHEMA_INTROSPECTION>

  <GUIDELINES>
    <IMPORTANT_RULES>
      1. Always use entity_id in queries unless specifically searching by realm_id
      2. Use limit parameters to control result size
      3. Include proper type casting in variables
      4. Follow the nested structure: Models → edges → node → specific type
      5. Only use the models listed below to query. If you get a response error - you might need to introspect the model.
    </IMPORTANT_RULES>
  </GUIDELINES>

  <AVAILABLE_MODELS>
    <MODEL_LIST>
      s0EternumAcceptOrderModels
      s0EternumAcceptPartialOrderModels
      s0EternumAddressNameModels
      s0EternumArmyModels
      s0EternumArmyTroopsModels
      s0EternumArrivalTimeModels
      s0EternumBankModels
      s0EternumBattleModels
      s0EternumBattleClaimDataModels
      s0EternumBattleConfigModels
      s0EternumBattleJoinDataModels
      s0EternumBattleLeaveDataModels
      s0EternumBattlePillageDataModels
      s0EternumBattlePillageDataTroopsModels
      s0EternumBattlePillageDataU8u128Models
      s0EternumBattleStartDataModels
      s0EternumBattleBattleArmyModels
      s0EternumBattleBattleHealthModels
      s0EternumBattleTroopsModels
      s0EternumBuildingModels
      s0EternumBuildingCategoryPopConfigModels
      s0EternumBuildingConfigModels
      s0EternumBuildingGeneralConfigModels
      s0EternumBuildingQuantityv2Models
      s0EternumBurnDonkeyModels
      s0EternumCancelOrderModels
      s0EternumCapacityCategoryModels
      s0EternumCapacityConfigModels
      s0EternumContributionModels
      s0EternumCreateGuildModels
      s0EternumCreateOrderModels
      s0EternumDetachedResourceModels
      s0EternumEntityNameModels
      s0EternumEntityOwnerModels
      s0EternumEpochModels
      s0EternumEpochContractAddressu16Models
      s0EternumFragmentMineDiscoveredModels
      s0EternumGameEndedModels
      s0EternumGuildModels
      s0EternumGuildMemberModels
      s0EternumGuildWhitelistModels
      s0EternumHealthModels
      s0EternumHyperstructureModels
      s0EternumHyperstructureCoOwnersChangeModels
      s0EternumHyperstructureCoOwnersChangeContractAddressu16Models
      s0EternumHyperstructureConfigModels
      s0EternumHyperstructureContributionModels
      s0EternumHyperstructureContributionU8u128Models
      s0EternumHyperstructureFinishedModels
      s0EternumHyperstructureResourceConfigModels
      s0EternumJoinGuildModels
      s0EternumLevelingConfigModels
      s0EternumLiquidityModels
      s0EternumLiquidityEventModels
      s0EternumLiquidityFixedModels
      s0EternumMapConfigModels
      s0EternumMapExploredModels
      s0EternumMapExploredU8u128Models
      s0EternumMarketModels
      s0EternumMarketFixedModels
      s0EternumMercenariesConfigModels
      s0EternumMercenariesConfigU8u128Models
      s0EternumMessageModels
      s0EternumMovableModels
      s0EternumOrdersModels
      s0EternumOwnedResourcesTrackerModels
      s0EternumOwnerModels
      s0EternumPopulationModels
      s0EternumPopulationConfigModels
      s0EternumPositionModels
      s0EternumProductionModels
      s0EternumProductionDeadlineModels
      s0EternumProductionInputModels
      s0EternumProductionOutputModels
      s0EternumProgressModels
      s0EternumProtecteeModels
      s0EternumProtectorModels
      s0EternumQuantityModels
      s0EternumQuantityTrackerModels
      s0EternumQuestModels
      s0EternumQuestBonusModels
      s0EternumQuestConfigModels
      s0EternumRealmModels
      s0EternumRealmLevelConfigModels
      s0EternumRealmMaxLevelConfigModels
      s0EternumResourceModels
      s0EternumResourceAllowanceModels
      s0EternumResourceBridgeConfigModels
      s0EternumResourceBridgeFeeSplitConfigModels
      s0EternumResourceBridgeWhitelistConfigModels
      s0EternumResourceCostModels
      s0EternumResourceTransferLockModels
      s0EternumSeasonModels
      s0EternumSettleRealmDataModels
      s0EternumSettlementConfigModels
      s0EternumSpeedConfigModels
      s0EternumStaminaModels
      s0EternumStaminaConfigModels
      s0EternumStaminaRefillConfigModels
      s0EternumStatusModels
      s0EternumStructureModels
      s0EternumStructureCountModels
      s0EternumStructureCountCoordModels
      s0EternumSwapEventModels
      s0EternumTickConfigModels
      s0EternumTileModels
      s0EternumTradeModels
      s0EternumTransferModels
      s0EternumTransferU8u128Models
      s0EternumTravelModels
      s0EternumTravelFoodCostConfigModels
      s0EternumTravelStaminaCostConfigModels
      s0EternumTravelCoordModels
      s0EternumTroopConfigModels
      s0EternumTrophyCreationModels
      s0EternumTrophyCreationTaskModels
      s0EternumTrophyProgressionModels
      s0EternumWeightModels
      s0EternumWeightConfigModels
      s0EternumWorldConfigModels
    </MODEL_LIST>
  </AVAILABLE_MODELS>

  <BEST_PRACTICES>
    1. Always validate entity_id before querying
    2. Use pagination for large result sets
    3. Include only necessary fields in your queries
    4. Handle null values appropriately
  </BEST_PRACTICES>
</QUERY_GUIDE>`;

export const PROVIDER_EXAMPLES = `
<PROVIDER_GUIDE>

    Use these to call functions.


  <IMPORTANT_RULES>
    1. If you receive an error, you may need to try again, the error message should tell you what went wrong.
    2. To verify a successful transaction, read the response you get back. You don't need to query anything.
  </IMPORTANT_RULES>

  <FUNCTIONS>
    <CREATE_ORDER>
      <DESCRIPTION>
        Creates a new trade order between realms.
      </DESCRIPTION>
      <PARAMETERS>
        - maker_id: ID of the realm creating the trade
        - maker_gives_resources: Resources the maker is offering
        - taker_id: ID of the realm that can accept the trade
        - taker_gives_resources: Resources requested from the taker
        - signer: Account executing the transaction
        - expires_at: When the trade expires
      </PARAMETERS>
      <EXAMPLE>
     
          {
            "contractAddress": "<eternum-trade_systems>",
            "entrypoint": "create_order",
            "calldata": [
              123,         
              1,           
              1,           
              100,         
              456,         
              1,           
              2,           
              50,          
              1704067200   
            ]
          }
  
      </EXAMPLE>
    </CREATE_ORDER>

    <ACCEPT_ORDER>
      <DESCRIPTION>
        Accepts an existing trade order.
      </DESCRIPTION>
      <PARAMETERS>
        - taker_id: ID of the realm accepting the trade
        - trade_id: ID of the trade being accepted
        - maker_gives_resources: Resources the maker is offering
        - taker_gives_resources: Resources requested from the taker
        - signer: Account executing the transaction
      </PARAMETERS>
      <EXAMPLE>
        <JSON>
          {
            "contractAddress": "<eternum-trade_systems>",
            "entrypoint": "accept_order",
            "calldata": [
              123,
              789,
              1,
              1,
              100,
              1,
              2,
              50
            ]
          }
        </JSON>
      </EXAMPLE>
    </ACCEPT_ORDER>

    <ACCEPT_PARTIAL_ORDER>
      <DESCRIPTION>
        Accepts a portion of an existing trade order.
      </DESCRIPTION>
      <PARAMETERS>
        - taker_id: ID of the realm accepting the trade
        - trade_id: ID of the trade being accepted
        - maker_gives_resources: Resources the maker is offering
        - taker_gives_resources: Resources requested from the taker
        - taker_gives_actual_amount: Actual amount taker will give
        - signer: Account executing the transaction
      </PARAMETERS>
      <EXAMPLE>
        <JSON>
          {
            "contractAddress": "<eternum-trade_systems>",
            "entrypoint": "accept_partial_order",
            "calldata": [
              123,
              789,
              1,
              1,
              100,
              1,
              2,
              50,
              25
            ]
          }
        </JSON>
      </EXAMPLE>
    </ACCEPT_PARTIAL_ORDER>

    <CANCEL_ORDER>
      <DESCRIPTION>
        Cancels an existing trade order.
      </DESCRIPTION>
      <PARAMETERS>
        - trade_id: ID of the trade to cancel
        - return_resources: Resources to return
        - signer: Account executing the transaction
      </PARAMETERS>
      <EXAMPLE>
        <JSON>
          {
            "contractAddress": "<eternum-trade_systems>",
            "entrypoint": "cancel_order",
            "calldata": [
              789,
              1,
              1,
              100
            ]
          }
        </JSON>
      </EXAMPLE>
    </CANCEL_ORDER>

    <CREATE_BUILDING>
      <DESCRIPTION>
        Creates a new building for a realm on the hexagonal grid map.
      </DESCRIPTION>
      <PARAMETERS>
        - entity_id: ID of the realm creating the building (required)
        - directions: Array of directions from castle to building location (required)
        - building_category: Type of building (required)
        - produce_resource_type: Resource type ID this building will produce (required for resource buildings)
      </PARAMETERS>
      <NOTES>
        Never use 0 for produce_resource_type, always use the resource type ID - eg: fish is 1, wheat is 1, etc.
      </NOTES>
      
      <PLACEMENT_GUIDE>
        <DESCRIPTION>
          The map uses a hexagonal grid with your realm's castle at the center (0,0). 
          Buildings are placed by specifying directions outward from the castle.
        </DESCRIPTION>
        
        <DIRECTION_IDS>
          0 = East (→)
          1 = Northeast (↗) 
          2 = Northwest (↖)
          3 = West (←)
          4 = Southwest (↙) 
          5 = Southeast (↘)
        </DIRECTION_IDS>

        <KEY_RULES>
          1. Cannot build on castle location (0,0)
          2. Building distance from castle is limited by realm level
          3. Each direction in the array represents one hex step from castle
          4. Location is determined by following directions sequentially
        </KEY_RULES>

        <RESOURCE_TYPES>
          <BASIC_RESOURCES>
            Stone (1)
            Coal (2) 
            Wood (3)
            Copper (4)
            Ironwood (5)
            Obsidian (6)
          </BASIC_RESOURCES>

          <PRECIOUS_RESOURCES>
            Gold (7)
            Silver (8)
            Mithral (9)
            AlchemicalSilver (10)
            ColdIron (11)
          </PRECIOUS_RESOURCES>

          <RARE_RESOURCES>
            DeepCrystal (12)
            Ruby (13)
            Diamonds (14)
            Hartwood (15)
            Ignium (16)
            TwilightQuartz (17)
            TrueIce (18)
            Adamantine (19)
            Sapphire (20)
            EtherealSilica (21)
            Dragonhide (22)
          </RARE_RESOURCES>

          <SPECIAL_RESOURCES>
            AncientFragment (29)
            Donkey (249)
            Knight (250)
            Crossbowman (251)
            Paladin (252)
            Lords (253)
            Wheat (1)
            Fish (1)
          </SPECIAL_RESOURCES>
        </RESOURCE_TYPES>
      </PLACEMENT_GUIDE>

      <EXAMPLE>
        <DESCRIPTION>
          Create a wood production building one hex northeast of castle:
        </DESCRIPTION>
        <JSON>
          {
            "contractAddress": "<eternum-building_systems>",
            "entrypoint": "create",
            "calldata": [
              123,
              [1],
              1,
              3
            ]
          }
        </JSON>
      </EXAMPLE>
    </CREATE_BUILDING>
  </FUNCTIONS>
</PROVIDER_GUIDE>`;
