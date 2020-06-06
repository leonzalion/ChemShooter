import Phaser from "phaser";
import Dungeon from "@mikewesthad/dungeon";
import Player from "./player.js";
import TILES from "./tile-mapping.js";
import TilemapVisibility from "./tilemap-visibility.js";

/**
 * Scene that generates a new dungeon
 */
export default class DungeonScene extends Phaser.Scene {
  constructor() {
    super();
    this.level = 0;
  }

  preload() {
    this.load.image("mytiles", "../assets/tilesets/buch-tileset-48px-extruded.png");
    this.load.image("tiles", "../assets/tilesets/dungeon.png" );
    this.load.image('wall-left', 'assets/tilesets/frames/wall_side_mid_left.png');
    this.load.image('wall-right', 'assets/tilesets/frames/wall_side_mid_right.png');
    this.load.spritesheet(
      "characters",
      "../assets/spritesheets/characters.png",
      {
        frameWidth: 16,
        frameHeight: 32
      }
    );
  }

  create() {
    this.level++;
    this.hasPlayerReachedStairs = false;

    // Generate a random world with a few extra options:
    //  - Rooms should only have odd number dimensions so that they have a center tile.
    //  - Doors should be at least 2 tiles away from corners, so that we can place a corner tile on
    //    either side of the door location
    this.dungeon = new Dungeon({
      width: 50,
      height: 50,
      doorPadding: 3,
      rooms: {
        width: { min: 7, max: 15, onlyOdd: true },
        height: { min: 7, max: 15, onlyOdd: true }
      }
    });

    this.dungeon.drawToConsole({});

    // Creating a blank tilemap with dimensions matching the dungeon
    const map = this.make.tilemap({
      tileWidth: 16,
      tileHeight: 16,
      width: this.dungeon.width,
      height: this.dungeon.height
    });
    const oldTileset = map.addTilesetImage("mytiles", null, 48, 48, 1, 2); // 1px margin, 2px spacing
    const tileset = map.addTilesetImage('tiles', null, 16, 16);
    this.wallGroup = this.physics.add.staticGroup();
    this.groundLayer = map.createBlankDynamicLayer("Ground", tileset).fill(TILES.BLANK);
    this.wallLayer = map.createBlankDynamicLayer("Wall", tileset);
    this.stuffLayer = map.createBlankDynamicLayer("Stuff", oldTileset);
    const shadowLayer = map.createBlankDynamicLayer("Shadow", oldTileset).fill(TILES.BLANK);

    this.tilemapVisibility = new TilemapVisibility(shadowLayer);

    // Use the array of rooms generated to place tiles in the map
    // Note: using an arrow function here so that "this" still refers to our scene
    this.dungeon.rooms.forEach(room => {
      const { x, y, width, height, left, right, top, bottom } = room;

      // Fill the floor with mostly clean tiles, but occasionally place a dirty tile
      // See "Weighted Randomize" example for more information on how to use weightedRandomize.
      this.groundLayer.weightedRandomize(x, y + 2, width, height - 2, TILES.FLOOR);

      // Place the room corners tiles
      this.wallLayer.putTilesAt(TILES.WALL.TOP_LEFT, left, top);
      this.wallLayer.putTilesAt(TILES.WALL.TOP_RIGHT, right, top);
      this.wallLayer.putTilesAt(TILES.WALL.BOTTOM_LEFT, left, bottom - 1);
      this.wallLayer.putTilesAt(TILES.WALL.BOTTOM_RIGHT, right, bottom - 1);

      for (let offsetX = 1; offsetX < width - 1; ++offsetX) {
        this.wallLayer.putTilesAt(TILES.WALL.TOP, left + offsetX, top);
        this.wallLayer.putTilesAt(TILES.WALL.TOP, left + offsetX, bottom - 1);
      }

      for (let offsetY = 2; offsetY < height - 2; ++offsetY) {
        this.wallLayer.putTileAt(TILES.WALL.LEFT, left, top + offsetY);
        this.wallLayer.putTileAt(TILES.WALL.RIGHT, right, top + offsetY);
      }

      // Dungeons have rooms that are connected with doors. Each door has an x & y relative to the
      // room's location
      const doors = room.getDoorLocations();
      for (const door of doors) {
        if (door.y === 0) {
          this.wallLayer.putTilesAt(TILES.DOOR.TOP, x + door.x - 1, y + door.y);
        } else if (door.y === room.height - 1) {
          this.wallLayer.putTilesAt(TILES.DOOR.BOTTOM, x + door.x - 1, y + door.y - 1);
        } else if (door.x === 0) {
          this.wallLayer.putTilesAt(TILES.DOOR.LEFT, x + door.x - 1, y + door.y - 1);
        } else if (door.x === room.width - 1) {
          this.wallLayer.putTilesAt(TILES.DOOR.RIGHT, x + door.x, y + door.y - 1);
        }
      }
    });

    // Separate out the rooms into:
    //  - The starting room (index = 0)
    //  - A random room to be designated as the end room (with stairs and nothing else)
    //  - An array of 90% of the remaining rooms, for placing random stuff (leaving 10% empty)
    const rooms = this.dungeon.rooms.slice();
    const startRoom = rooms.shift();
    const endRoom = Phaser.Utils.Array.RemoveRandomElement(rooms);
    const otherRooms = Phaser.Utils.Array.Shuffle(rooms).slice(0, rooms.length * 0.9);

    // Place the stairs
    this.stuffLayer.putTileAt(TILES.STAIRS, endRoom.centerX, endRoom.centerY);

    // Place stuff in the 90% "otherRooms"
    otherRooms.forEach(room => {
      var rand = Math.random();
      if (rand <= 0.25) {
        // 25% chance of chest
        this.stuffLayer.putTileAt(TILES.CHEST, room.centerX, room.centerY);
      } else if (rand <= 0.5) {
        // 50% chance of a pot anywhere in the room... except don't block a door!
        const x = Phaser.Math.Between(room.left + 2, room.right - 2);
        const y = Phaser.Math.Between(room.top + 2, room.bottom - 2);
        this.stuffLayer.weightedRandomize(x, y, 1, 1, TILES.POT);
      } else {
        // 25% of either 2 or 4 towers, depending on the room size
        if (room.height >= 9) {
          this.stuffLayer.putTilesAt(TILES.TOWER, room.centerX - 1, room.centerY + 1);
          this.stuffLayer.putTilesAt(TILES.TOWER, room.centerX + 1, room.centerY + 1);
          this.stuffLayer.putTilesAt(TILES.TOWER, room.centerX - 1, room.centerY - 2);
          this.stuffLayer.putTilesAt(TILES.TOWER, room.centerX + 1, room.centerY - 2);
        } else {
          this.stuffLayer.putTilesAt(TILES.TOWER, room.centerX - 1, room.centerY - 1);
          this.stuffLayer.putTilesAt(TILES.TOWER, room.centerX + 1, room.centerY - 1);
        }
      }
    });

    // Not exactly correct for the tileset since there are more possible floor tiles, but this will
    // do for the example.
    this.groundLayer.setCollisionByExclusion([41, 42]);
    this.wallLayer.setCollisionByExclusion([-1, 41, 80, 81]);
    this.stuffLayer.setCollisionByExclusion([-1, 6, 7, 8, 26]);

    this.wallLayer.forEachTile(tile => {
      if (tile.index === TILES.WALL.LEFT || tile.index === TILES.WALL.RIGHT) {
        const x = tile.getCenterX();
        const y = tile.getCenterY();
        let wall;
        if (tile.index === TILES.WALL.LEFT) {
          wall = this.wallGroup.create(x, y, 'wall-right', 0, false);
          wall.body.setSize(4, 16).setOffset(0, 0);
        } else {
          wall = this.wallGroup.create(x, y, 'wall-left', 0, false);
          wall.body.setOffset(12, 0);
        }
      }
    });

    this.stuffLayer.setTileIndexCallback(TILES.STAIRS, () => {
      this.stuffLayer.setTileIndexCallback(TILES.STAIRS, null);
      this.hasPlayerReachedStairs = true;
      this.player.freeze();
      const cam = this.cameras.main;
      cam.fade(250, 0, 0, 0);
      cam.once("camerafadeoutcomplete", () => {
        this.player.destroy();
        this.scene.restart();
      });
    });

    // Place the player in the first room
    const playerRoom = startRoom;
    const x = map.tileToWorldX(playerRoom.centerX);
    const y = map.tileToWorldY(playerRoom.centerY);
    this.player = new Player(this, x, y);

    // Watch the player and tilemap layers for collisions, for the duration of the scene:
    this.physics.add.collider(this.player.sprite, this.wallLayer);
    this.physics.add.collider(this.player.sprite, this.stuffLayer);
    this.physics.add.collider(this.player.sprite, this.wallGroup);

    // Phaser supports multiple cameras, but you can access the default camera like this:
    const camera = this.cameras.main;

    // Constrain the camera so that it isn't allowed to move outside the width/height of tilemap
    camera.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    camera.startFollow(this.player.sprite);

    // Help text that has a "fixed" position on the screen
    this.add
      .text(16, 16, `Find the stairs. Go deeper.\nCurrent level: ${this.level}`, {
        font: "18px monospace",
        fill: "#000000",
        padding: { x: 20, y: 10 },
        backgroundColor: "#ffffff"
      })
      .setScrollFactor(0);
  }

  update(time, delta) {
    if (this.hasPlayerReachedStairs) return;

    this.player.update();

    // Find the player's room using another helper method from the dungeon that converts from
    // dungeon XY (in grid units) to the corresponding room object
    const playerTileX = this.groundLayer.worldToTileX(this.player.sprite.x);
    const playerTileY = this.groundLayer.worldToTileY(this.player.sprite.y);
    const playerRoom = this.dungeon.getRoomAt(playerTileX, playerTileY);

    this.tilemapVisibility.setActiveRoom(playerRoom);
  }
}
