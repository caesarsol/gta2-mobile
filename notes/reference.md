# GTA2 reference data (vehicles, map format)

Facts about the game's data that probes and dev hooks rely on. Sources: the game itself (read
live, see each section) and DMA's map format document, *GBH map format* v8.2 (1999), mirrored at
<https://gtamp.com/gta2/gta2-gmp-map-file-format/>; cross-checked against `gta2_re`
(`Source/map_0x370.*`).

## Vehicles: model number → name

The model number is the handling / car-info index (`Car_BC::field_84_car_info_idx`, the
`model` of `gta2_dev_spawn_car*`, `gta2_dev_state()[6]`, the overlay's `Car <n>`). The name is
the game's own, text key `car<n>` (what the HUD shows on entering; `gta2_dev_car_name(model,
buf, max)`). Read in Downtown (area 1), 2026-11-04:

| # | name | # | name | # | name |
|---|------|---|------|---|------|
| 0 | Romero | 29 | Dementia | 58 | Tow Truck |
| 1 | Wellard | 30 | Land Roamer | 59 | Train |
| 2 | Aniston BD4 | 31 | Jefferson | 60 | Train Cab |
| 3 | Pacifier | 32 | Stretch Limousine | 61 | Train FB |
| 4 | G4 Bank Van | 33 | Sports Limousine | 62 | Trance-Am |
| 5 | Beamer | 34 | Medicar | 63 | Truck Cab |
| 6 | Box Car | 35 | Benson | 64 | Truck Cab SX |
| 7 | Box Truck | 36 | Schmidt | 65 | Container |
| 8 | Bug | 37 | Miara | 66 | Transporter |
| 9 | — | 38 | Big Bug | 67 | TV Van |
| 10 | Bulwark | 39 | Morton | 68 | Van |
| 11 | Bus | 40 | Maurice | 69 | U-Jerk Truck |
| 12 | Cop Car | 41 | Pickup | 70 | **Z-Type** |
| 13 | Minx | 42 | A-Type | 71 | Rumbler |
| 14 | Eddy | 43 | — | 72–81 | Wreck 0 … Wreck 9 |
| 15 | — | 44 | Arachnid | 82 | Jagular XK |
| 16 | Panto | 45 | Spritzer | 83 | Furore GT |
| 17 | Fire Truck | 46 | Stinger | 84 | Special Agent Car |
| 18 | Shark | 47 | Meteor | 85 | Hot Dog Dummy 4 |
| 19 | GT-A1 | 48 | Meteor | 86 | Karma Bus |
| 20 | — | 49 | Hachura | | |
| 21 | Garbage Truck | 50 | B-Type | | |
| 22 | Armed Land Roamer (gun jeep) | 51 | Taxi Xpress | | |
| 23 | Hot Dog Van | 52 | SWAT Van | | |
| 24–26 | Hot Dog Dummy 1–3 | 53 | Michelli Roadster | | |
| 27 | Ice-Cream Van | 54 | Tank | | |
| 28 | Dementia Limousine | 55 | Tanker | | |
| | | 56 | Taxi | | |
| | | 57 | T-Rex | | |

- **The `car_model_enum` names in `gta2_re` (`Source/enums.hpp`) are not these names**: they
  are the original's internal labels, and only the special vehicles line up (11 BUS, 12 COPCAR,
  17 FIRETRUK, 22 GUNJEEP, 54 TANK, 59–61 trains, 72–81 wrecks: the engine tests those indices
  for turrets, sirens and so on). `ZCX5 = 83` is the Furore GT, `VESPA = 69` the U-Jerk Truck.
  Earlier notes called 83 "the Zaibatsu Z-Type": wrong, the Z-Type is 70.
- No names: 9, 15, 20, 43 (20 "cannot be entered", see `notes/testing.md`).
- **GTA2 has no motorbikes.** The bike code paths (`uni_num` 2) come from GTA1's engine.
- The fast car of the steering measurements is 25 (Hot Dog Dummy 2, its handling copy).

## Map blocks (`gmp_block_info`, 12 bytes)

`u16 left, right, top, bottom, lid; u8 arrows; u8 slope_type`.

**Side faces** (left/right/top/bottom): bits 0–9 tile (0–1023), 10 **wall** (cars, peds and
objects collide), 11 bullet wall, 12 flat (transparent, the opposite face's tile on the reverse),
13 flip, 14–15 rotation (0/90/180/270°). Wall / bullet wall: (1,1), (1,0) or (0,0), never (0,1).

**Lid**: bits 0–9 tile, 10–11 lighting (0 normal, 1–3 darker), 12 flat, 13 flip, 14–15 rotation.
`map_web.cpp` treats a flat lid as see-through.

**Arrows**: bit 0 green left, 1 green right, 2 green up, 3 green down, 4–7 the same in red.
Green arrows are the traffic network (ambient traffic is generated only on arrowed road: the
test area has none). Red ones are special routes (emergency vehicles, hurry). Arrows can sit
on any ground type except air.

**slope_type**: bits 0–1 ground type (0 air, 1 road, 2 pavement, 3 field: `gmp_slope_type`);
bits 2–7 slope code:

| code | slope |
|------|-------|
| 0 | none |
| 1–2 / 3–4 / 5–6 / 7–8 | 26° gradient up / down / left / right (low, high block) |
| 9–16 / 17–24 / 25–32 / 33–40 | 7° gradient up / down / left / right (8 blocks, low → high) |
| 41–44 | 45° up / down / left / right |
| 45–48 | diagonal facing up-left / up-right / down-left / down-right |
| 49–52 | 3-sided (lid tile 1023) or 4-sided diagonal, same order |
| 53–56 | partial block left / right / top / bottom (24 px) |
| 57–60 | partial corner top-left / top-right / bottom-right / bottom-left (24 × 24 px) |
| 61 | partial centre block (16 × 16) |
| 62 | reserved |
| 63 | not a slope: the block **above** is one (ground type must be air) |

The engine's checks match: `(slope_type & 0xFC) == 0xFC` = code 63 (`GetRoadBlockAt_4E6660`
then looks one block up); `0xB4..0xD0` = codes 45–52 (diagonals). Diagonals and 3-sided
slopes collide only on their bottom side.

## Compressed map (DMAP) and runtime changes

`u32 base[256][256]` (per (x, y), a word offset into `column`), `u32 column_words`,
`u32 column[]`, `u32 num_blocks`, `block_info block[]`; block 0 is all-zero air. A column:
`u8 height` (0–7, one past the top block), `u8 offset` (empty blocks at the bottom), `u16 pad`,
`u32 blockd[height − offset]` (block indices, `blockd[0]` at z = offset). Limits 131 072 column
words and 131 072 blocks.

- Columns and blocks are **shared**: many (x, y) point at the same column. Changing one
  square = pointing its `base` entry at another column, never editing a shared one.
- The loader reserves room for runtime changes: 1024 column words and 200 blocks
  (`Map_0x370::field_35C_column_word_extra` / `field_350_num_blocks_extra`; in use up to
  `field_360` / `field_354`). The mission scripts use it (`ChangeBlock_4E8620`,
  `AddNewBlock_4E87C0`, `CloneOriginalColumn_4E81D0`, `AddBlock_4E8140`), and so does the test
  area (`port/platform/test_area_web.cpp`: 3 columns, 3 blocks).
- Logged changes (`Map_sub`, at most 100 squares) go into GTA2's own savegames; direct `base`
  writes do not. The port's save states snapshot memory, so they keep both.
- Districts fill all 256 × 256 squares (Downtown: no empty column at all). Nothing beyond the
  edge can be addressed.

## Map objects and zones

- Map-file objects (`gmp_map_object`: `Fix16 x, y` at 1/128 block, `Ang8 rotation`,
  `u8 object_type`, no z) are spawned at load (`SpawnMapObjects_4DFB90`). **Downtown's list is
  empty**: every live object there (1259 at a clean start) was created by the mission script
  or the junction system, and scripts keep pointers to theirs (removing them crashed the game).
- Common object models (`objects::` in `enums.hpp`): 2 bollard, 25 tower, 122 ped crossing
  marker, 130 car shop, 134/135/140 crane, 139 conveyor, 141 destructor, 142/143/150 car
  crusher, 148 tank cannon, 161 phone, 167/169 doors, 170 traffic light hull, 255 traffic
  light lighting, 258 ped crossing trigger, 266 secret token, 278 sound object, 286+ arrows,
  294 tunnel blocker, 200–252 pickups.
- Zone types: 0 general, 1 navigation, 2 traffic light, 5 arrow blocker, 6 railway platform,
  7 bus stop, 8 general trigger, 10 information, 11/12/13 railway entry / exit / stop,
  14 gang, 15 local navigation, 16 restart, 20 arrest restart (3, 4, 9, 17–19 unused).

## Lessons

- 2026-11-04: model 83 was called "the Z-Type" in these notes for weeks (from the source enum
  `ZCX5`); the game's text says Furore GT. Read names with `gta2_dev_car_name`, never from the
  enum.
