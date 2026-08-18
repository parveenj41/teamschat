const express = require('express');
const Group = require('../models/Group');
const User = require('../models/User');
const auth = require('../middleware/auth');

const router = express.Router();

/**
 * Populate an already-loaded Group document.
 *
 * IMPORTANT:
 * Do not pass a Mongoose Query into this function.
 * The group must already be fetched with await Group.findById()
 * or await Group.find().
 */
async function populateGroup(group) {
  if (!group) {
    return null;
  }

  await group.populate([
    {
      path: 'members',
      select: 'name email'
    },
    {
      path: 'admins',
      select: 'name email'
    },
    {
      path: 'createdBy',
      select: 'name email'
    }
  ]);

  return group;
}

/**
 * Check whether a user is a member of the group.
 */
const isMember = (group, userId) => {
  return (group.members || []).some(
    member => String(member) === String(userId)
  );
};

/**
 * Check whether a user is an admin of the group.
 */
const isAdmin = (group, userId) => {
  return (group.admins || []).some(
    admin => String(admin) === String(userId)
  );
};

/**
 * Make sure the group always has valid admins.
 *
 * Rules:
 * 1. An admin must also be a member.
 * 2. If there are members but no admins,
 *    promote the first member.
 */
async function ensureAdmins(group) {
  const members = group.members || [];
  const currentAdmins = group.admins || [];

  const before = currentAdmins
    .map(String)
    .sort()
    .join(',');

  // Remove admins who are no longer group members.
  group.admins = currentAdmins.filter(admin =>
    members.some(member => String(member) === String(admin))
  );

  // If members exist but there is no admin,
  // automatically promote the first member.
  if (
    group.admins.length === 0 &&
    members.length > 0
  ) {
    group.admins = [members[0]];
  }

  const after = group.admins
    .map(String)
    .sort()
    .join(',');

  if (before !== after) {
    await group.save();
  }

  return group;
}

/**
 * Emit groupUpdated event to the group's Socket.IO room.
 */
function emitGroupUpdated(req, group) {
  const io = req.app.get('io');

  if (!io || !group || !group._id) {
    return;
  }

  io
    .to(`group:${group._id.toString()}`)
    .emit('groupUpdated', group);
}

/**
 * Emit an event to a specific user's Socket.IO room.
 */
function emitToUser(req, userId, event, payload) {
  const io = req.app.get('io');

  if (!io || !userId) {
    return;
  }

  io
    .to(`user:${String(userId)}`)
    .emit(event, payload);
}


/* =========================================================
   GET ALL GROUPS
   ========================================================= */

/**
 * GET /api/groups
 *
 * Returns groups where the logged-in user is a member.
 */
router.get('/', auth, async (req, res) => {
  try {
    const groups = await Group.find({
      members: req.user.id,
      name: { $exists: true, $ne: '' }
    })
      .sort({ updatedAt: -1 })
      .populate([
        {
          path: 'members',
          select: 'name email'
        },
        {
          path: 'admins',
          select: 'name email'
        },
        {
          path: 'createdBy',
          select: 'name email'
        }
      ])
      .lean();

    res.json(groups);

  } catch (err) {
    console.error('Error fetching groups:', err);

    res.status(500).json({
      message: 'Server error fetching groups'
    });
  }
});


/* =========================================================
   CREATE GROUP
   ========================================================= */

/**
 * POST /api/groups
 *
 * Creates a new group.
 *
 * The creator automatically becomes:
 * - Group member
 * - Group admin
 */
router.post('/', auth, async (req, res) => {
  try {
    const {
      name,
      description,
      memberEmails
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        message: 'Group name is required'
      });
    }

    // Creator is always the first member.
    let memberIds = [
      req.user.id
    ];

    /*
     * Optional member emails.
     */
    if (Array.isArray(memberEmails)) {

      const emails = [
        ...new Set(
          memberEmails
            .map(email =>
              String(email)
                .toLowerCase()
                .trim()
            )
            .filter(Boolean)
        )
      ];

      if (emails.length > 0) {

        const users = await User.find({
          email: {
            $in: emails
          }
        });

        const foundUserIds = users.map(
          user => String(user._id)
        );

        memberIds = [
          ...new Set([
            ...memberIds,
            ...foundUserIds
          ])
        ];
      }
    }

    const group = await Group.create({
      name: name.trim(),

      description:
        description || '',

      createdBy:
        req.user.id,

      members:
        memberIds,

      admins: [
        req.user.id
      ]
    });

    const populatedGroup =
      await populateGroup(group);

    res.status(201).json(
      populatedGroup
    );

  } catch (err) {

    console.error(
      'Error creating group:',
      err
    );

    res.status(500).json({
      message:
        'Server error creating group'
    });
  }
});


/* =========================================================
   ADD MEMBER
   ========================================================= */

/**
 * POST /api/groups/:id/members
 *
 * Add a user to a group using email.
 *
 * ONLY GROUP ADMINS CAN DO THIS.
 */
router.post(
  '/:id/members',
  auth,
  async (req, res) => {

    try {

      const group =
        await Group.findById(
          req.params.id
        );

      if (!group) {
        return res.status(404).json({
          message:
            'Group not found'
        });
      }

      await ensureAdmins(group);

      if (
        !isAdmin(
          group,
          req.user.id
        )
      ) {
        return res.status(403).json({
          message:
            'Only group admins can add members'
        });
      }

      const email =
        String(
          req.body.email || ''
        )
        .toLowerCase()
        .trim();

      if (!email) {
        return res.status(400).json({
          message:
            'Email is required'
        });
      }

      const user =
        await User.findOne({
          email
        });

      if (!user) {
        return res.status(404).json({
          message:
            'No user found with that email'
        });
      }

      if (
        isMember(
          group,
          user._id
        )
      ) {
        return res.status(400).json({
          message:
            'User is already a group member'
        });
      }

      group.members.push(
        user._id
      );

      await group.save();

      const populatedGroup =
        await populateGroup(group);

      emitGroupUpdated(
        req,
        populatedGroup
      );

      emitToUser(
        req,
        user._id,
        'addedToGroup',
        populatedGroup
      );

      res.json(
        populatedGroup
      );

    } catch (err) {

      console.error(
        'Error adding group member:',
        err
      );

      res.status(500).json({
        message:
          'Server error adding member'
      });
    }
  }
);


/* =========================================================
   REMOVE MEMBER
   ========================================================= */

/**
 * DELETE /api/groups/:id/members/:userId
 *
 * Remove a member from a group.
 *
 * ONLY GROUP ADMINS CAN DO THIS.
 */
router.delete(
  '/:id/members/:userId',
  auth,
  async (req, res) => {

    try {

      const group =
        await Group.findById(
          req.params.id
        );

      if (!group) {
        return res.status(404).json({
          message:
            'Group not found'
        });
      }

      await ensureAdmins(group);

      if (
        !isAdmin(
          group,
          req.user.id
        )
      ) {
        return res.status(403).json({
          message:
            'Only group admins can remove members'
        });
      }

      /*
       * Admin should use Leave Group
       * to remove themselves.
       */
      if (
        String(req.params.userId) ===
        String(req.user.id)
      ) {
        return res.status(400).json({
          message:
            'Use Leave Group to remove yourself'
        });
      }

      if (
        !isMember(
          group,
          req.params.userId
        )
      ) {
        return res.status(400).json({
          message:
            'User is not a member'
        });
      }

      /*
       * Remove member.
       */
      group.members =
        group.members.filter(
          member =>
            String(member) !==
            String(req.params.userId)
        );

      /*
       * If the removed user was an admin,
       * remove their admin permission too.
       */
      group.admins =
        group.admins.filter(
          admin =>
            String(admin) !==
            String(req.params.userId)
        );

      /*
       * Make sure at least one admin remains.
       */
      await ensureAdmins(group);

      await group.save();

      const populatedGroup =
        await populateGroup(group);

      emitGroupUpdated(
        req,
        populatedGroup
      );

      emitToUser(
        req,
        req.params.userId,
        'removedFromGroup',
        {
          groupId:
            group._id.toString()
        }
      );

      res.json(
        populatedGroup
      );

    } catch (err) {

      console.error(
        'Error removing group member:',
        err
      );

      res.status(500).json({
        message:
          'Server error removing member'
      });
    }
  }
);


/* =========================================================
   PROMOTE MEMBER TO ADMIN
   ========================================================= */

/**
 * POST /api/groups/:id/admins/:userId
 *
 * Promote a member to admin.
 *
 * ONLY EXISTING ADMINS CAN DO THIS.
 */
router.post(
  '/:id/admins/:userId',
  auth,
  async (req, res) => {

    try {

      const group =
        await Group.findById(
          req.params.id
        );

      if (!group) {
        return res.status(404).json({
          message:
            'Group not found'
        });
      }

      await ensureAdmins(group);

      if (
        !isAdmin(
          group,
          req.user.id
        )
      ) {
        return res.status(403).json({
          message:
            'Only group admins can promote members'
        });
      }

      if (
        !isMember(
          group,
          req.params.userId
        )
      ) {
        return res.status(400).json({
          message:
            'User is not a group member'
        });
      }

      /*
       * Don't add duplicate admin.
       */
      if (
        !isAdmin(
          group,
          req.params.userId
        )
      ) {

        group.admins.push(
          req.params.userId
        );

        await group.save();
      }

      const populatedGroup =
        await populateGroup(group);

      emitGroupUpdated(
        req,
        populatedGroup
      );

      emitToUser(
        req,
        req.params.userId,
        'groupAdminUpdated',
        {
          groupId:
            group._id.toString(),

          isAdmin: true
        }
      );

      res.json(
        populatedGroup
      );

    } catch (err) {

      console.error(
        'Error promoting group admin:',
        err
      );

      res.status(500).json({
        message:
          'Server error promoting admin'
      });
    }
  }
);


/* =========================================================
   DEMOTE ADMIN
   ========================================================= */

/**
 * DELETE /api/groups/:id/admins/:userId
 *
 * Demote an admin back to a normal member.
 *
 * The final admin cannot be removed.
 */
router.delete(
  '/:id/admins/:userId',
  auth,
  async (req, res) => {

    try {

      const group =
        await Group.findById(
          req.params.id
        );

      if (!group) {
        return res.status(404).json({
          message:
            'Group not found'
        });
      }

      await ensureAdmins(group);

      if (
        !isAdmin(
          group,
          req.user.id
        )
      ) {
        return res.status(403).json({
          message:
            'Only group admins can demote admins'
        });
      }

      /*
       * Prevent an admin from demoting themselves.
       */
      if (
        String(req.params.userId) ===
        String(req.user.id)
      ) {
        return res.status(400).json({
          message:
            'You cannot demote yourself'
        });
      }

      if (
        !isAdmin(
          group,
          req.params.userId
        )
      ) {
        return res.status(400).json({
          message:
            'User is not an admin'
        });
      }

      /*
       * Always keep at least one admin.
       */
      if (
        group.admins.length <= 1
      ) {
        return res.status(400).json({
          message:
            'Group must have at least one admin'
        });
      }

      group.admins =
        group.admins.filter(
          admin =>
            String(admin) !==
            String(req.params.userId)
        );

      await group.save();

      const populatedGroup =
        await populateGroup(group);

      emitGroupUpdated(
        req,
        populatedGroup
      );

      emitToUser(
        req,
        req.params.userId,
        'groupAdminUpdated',
        {
          groupId:
            group._id.toString(),

          isAdmin: false
        }
      );

      res.json(
        populatedGroup
      );

    } catch (err) {

      console.error(
        'Error demoting group admin:',
        err
      );

      res.status(500).json({
        message:
          'Server error demoting admin'
      });
    }
  }
);


/* =========================================================
   LEAVE GROUP
   ========================================================= */

/**
 * POST /api/groups/:id/leave
 *
 * Logged-in user leaves a group.
 *
 * If the leaving user is the only admin:
 * another member is automatically promoted.
 *
 * If the user is the last member:
 * the group is deleted.
 */
router.post(
  '/:id/leave',
  auth,
  async (req, res) => {

    try {

      const group =
        await Group.findById(
          req.params.id
        );

      if (!group) {
        return res.status(404).json({
          message:
            'Group not found'
        });
      }

      if (
        !isMember(
          group,
          req.user.id
        )
      ) {
        return res.status(400).json({
          message:
            'You are not a member of this group'
        });
      }

      /*
       * Remove the user from members.
       */
      group.members =
        group.members.filter(
          member =>
            String(member) !==
            String(req.user.id)
        );

      /*
       * Remove admin permission if applicable.
       */
      group.admins =
        (group.admins || []).filter(
          admin =>
            String(admin) !==
            String(req.user.id)
        );

      /*
       * If nobody remains,
       * delete the group.
       */
      if (
        group.members.length === 0
      ) {

        const groupId =
          group._id.toString();

        await Group.findByIdAndDelete(
          group._id
        );

        const io =
          req.app.get('io');

        if (io) {
          io
            .to(`group:${groupId}`)
            .emit(
              'groupDeleted',
              {
                groupId
              }
            );
        }

        return res.json({
          left: true,
          deleted: true,
          groupId
        });
      }

      /*
       * If the leaving user was the only admin,
       * promote another remaining member.
       */
      await ensureAdmins(group);

      await group.save();

      const populatedGroup =
        await populateGroup(group);

      emitGroupUpdated(
        req,
        populatedGroup
      );

      emitToUser(
        req,
        req.user.id,
        'removedFromGroup',
        {
          groupId:
            group._id.toString()
        }
      );

      res.json({
        left: true,
        deleted: false,
        group: populatedGroup
      });

    } catch (err) {

      console.error(
        'Error leaving group:',
        err
      );

      res.status(500).json({
        message:
          'Server error leaving group'
      });
    }
  }
);


module.exports = router;