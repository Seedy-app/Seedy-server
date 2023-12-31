const {
  Category,
  Post,
  Community,
  UserCommunity,
  Role,
  User,
  Op,
  Comment,
  CommentReaction,
  PostReaction,
  Sequelize,
} = require("../models");

exports.list = async (req, res) => {
  try {
    const communities = await Community.findAll({
      attributes: ["id", "name", "description", "picture"],
      include: [
        {
          model: User,
          as: "users",
          attributes: [],
          through: {
            model: UserCommunity,
            attributes: [],
          },
        },
      ],
    });

    const communitiesWithUserCount = await Promise.all(
      communities.map(async (community) => {
        const userCount = await community.countUsers();
        return {
          ...community.get(),
          userCount,
        };
      })
    );
    res.status(200).json(communitiesWithUserCount);
  } catch (error) {
    console.error("Error fetching communities:", error);
    res.status(500).json({ message: "Error fetching communities" });
  }
};

exports.checkCommunityName = async (req, res) => {
  try {
    if (!req.body.name) {
      return res.status(400).json({
        message: "Parameters missing: name not present",
      });
    }
    const { name, ignore_community_id } = req.body;
    let whereConditions = { name };
    if (ignore_community_id) {
      whereConditions.id = { [Op.ne]: ignore_community_id };
    }
    const community = await Community.findOne({ where: whereConditions });
    if (community) {
      res.status(409).json({ message: "Community name already exists" });
    } else {
      res.json({ message: "Community name is available" });
    }
  } catch (error) {
    console.error("Error checking community name:", error);
    res.status(500).json({
      message: "Internal Server Error",
    });
  }
};

exports.create = async (req, res) => {
  try {
    if (!req.body.name || !req.body.description || !req.body.picture) {
      return res.status(400).json({
        message:
          "Parameters missing: name, description, picture or user_id not present",
      });
    }
    const community = await Community.create({
      name: req.body.name,
      description: req.body.description,
      picture: req.body.picture,
    });
    res.json({
      message: "Community registered successfully",
      id: community.id,
    });
  } catch (error) {
    console.error("Error creating community:", error);
    res.status(500).json({
      message: "Internal Server Error",
    });
  }
};

exports.edit = async (req, res) => {
  try {
    const { name, description, imageUrl } = req.body;
    const { community_id } = req.params;
    const community = await Community.findOne({ where: { id: community_id } });

    if (!community) {
      return res.status(404).send({ message: "Community not found" });
    }

    if (name) community.name = name;
    if (description) community.description = description;
    if (imageUrl) community.picture = imageUrl;
    await community.save();

    res.status(200).send(community);
  } catch (error) {
    console.error("Error editing community:", error);
    res.status(500).send({ message: "Error editing community" });
  }
};

exports.deleteCommunity = async (req, res) => {
  try {
    const community_id = req.params.community_id;

    if (!community_id) {
      return res.status(400).json({
        message: "Parameters missing: community_id not present",
      });
    }
    const user_id = req.user.id;

    const userCommunity = await UserCommunity.findOne({
      where: {
        user_id: user_id,
        community_id,
      },
      include: [
        {
          model: Role,
          as: "role",
        },
      ],
    });
    if (
      !userCommunity ||
      !["community_founder", "system_administrator"].includes(
        userCommunity.role.name
      )
    ) {
      return res.status(403).json({
        message: "You don't have the necessary permissions to do that.",
      });
    }

    const community = await Community.findByPk(community_id);
    if (!community) {
      return res.status(404).json({ message: "Community not found" });
    }
    await community.destroy();
    res.status(200).json({ message: "Community deleted successfully" });
  } catch (error) {
    console.error("Error deleting community:", error);
    res.status(500).json({
      message: "Internal Server Error",
    });
  }
};

exports.giveUserCommunityRole = async (req, res) => {
  try {
    const { user_id } = req.body;
    const { community_id } = req.params;

    // Verifica si el usuario es administrador
    const isAdmin = await User.findOne({
      where: { id: user_id, isAdmin: true },
    });

    let role;

    // Asigna rol de system_admin si es admin, de lo contrario usa el rol proporcionado
    if (isAdmin) {
      role = await Role.findOne({ where: { name: "system_admin" } });
    } else {
      const { role_name } = req.body;
      if (!role_name) {
        return res.status(400).json({
          message: "Parameter missing: role_name not present",
        });
      }
      role = await Role.findOne({ where: { name: role_name } });
    }

    if (!role) {
      return res.status(404).json({
        message: "Role not found",
      });
    }

    const role_id = role.id;
    const existingEntry = await UserCommunity.findOne({
      where: { user_id, community_id },
    });

    if (existingEntry) {
      existingEntry.role_id = role_id;
      await existingEntry.save();
    } else {
      await UserCommunity.create({ user_id, community_id, role_id });
    }

    res.json({ message: "Role assigned successfully" });
  } catch (error) {
    console.error("Error assigning role:", error);
    res.status(500).json({
      message: "Internal Server Error",
    });
  }
};

exports.getUserRole = async (req, res) => {
  try {
    const { community_id, user_id } = req.params;
    if (!user_id || !community_id) {
      return res.status(400).json({
        message: "Parameters missing: user_id, or community_id not present",
      });
    }

    const user_role = await UserCommunity.findOne({
      where: { user_id, community_id },
      attributes: ["role_id"],
    });

    if (!user_role) {
      return res.status(404).json({
        message: "This user has no role in that community",
      });
    }

    const role = await Role.findByPk(user_role.role_id, {
      attributes: ["id", "name", "display_name"],
    });
    if (!role) {
      return res.status(404).json({
        message: "Role not found",
      });
    }

    res.json(role);
  } catch (error) {
    console.error("Error fetching role:", error);
    res.status(500).json({
      message: "Internal Server Error",
    });
  }
};

exports.changeImage = async (req, res) => {
  try {
    if (!req.params.community_id || !req.body.picture) {
      return res.status(400).json({
        message: "Parameters missing: community_id or picture not present",
      });
    }
    const community = await Community.findOne({
      where: { id: req.params.community_id },
    });
    if (community === null) {
      res.status(404).json({
        message: `Community not found (id:${req.params.community_id})`,
      });
    } else {
      community.picture = req.body.picture;
      await community.save();
      res.json({
        message: "Community registered successfully",
      });
    }
  } catch (error) {
    console.error("Error changing community image:", error);
    res.status(500).json({
      message: "Internal Server Error",
    });
  }
};

exports.getMembers = async (req, res) => {
  try {
    // Primera consulta para obtener los miembros de la comunidad
    const community = await Community.findOne({
      where: { id: req.params.community_id },
      include: [
        {
          model: User,
          as: "users",
          attributes: ["id", "username", "picture"],
          through: {
            attributes: ["role_id"],
          },
        },
      ],
    });

    if (!community) {
      return res.status(404).json({
        message: "Community not found.",
      });
    }

    // Segunda consulta para obtener los nombres de los roles
    const roles = await Role.findAll({
      attributes: ["id", "name", "display_name"],
    });

    // Combinar los resultados
    const membersWithRoles = community.users.map((user) => {
      const roleId =
        user.UserCommunity && user.UserCommunity.dataValues
          ? user.UserCommunity.dataValues.role_id
          : null;
      const role = roles.find((r) => r.id === roleId);
      return {
        id: user.dataValues.id,
        username: user.dataValues.username,
        picture: user.dataValues.picture,
        role: role ? role.name : None,
        role_display_name: role ? role.display_name : None,
      };
    });
    res.json({
      data: membersWithRoles,
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
      message: "Internal Server Error",
    });
  }
};

exports.getCategories = async (req, res) => {
  const { limit, page } = req.body;
  const { community_id } = req.params;

  try {
    let options = {
      where: { community_id },
      attributes: [
        "id",
        "name",
        "description",
        [
          Sequelize.literal(`(
        SELECT COUNT(*)
        FROM Posts AS post
        WHERE
          post.category_id = Category.id
      )`),
          "postCount",
        ],
      ],
      order: [["createdAt", "ASC"]],
    };

    if (limit > 0) {
      const offset = (page - 1) * limit;
      options.limit = limit;
      options.offset = offset;
    }

    const { count, rows: categories } = await Category.findAndCountAll(options);
    const totalPages = limit > 0 ? Math.ceil(count / limit) : 1;

    if (count === 0) {
      return res
        .status(404)
        .json({ message: "No categories found for this community." });
    }

    res.status(200).json({ categories, totalPages });
  } catch (error) {
    console.error("Error fetching categories:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

exports.checkCategoryName = async (req, res) => {
  try {
    if (!req.body.name) {
      return res.status(400).json({
        message: "Parameters missing: name not present",
      });
    }
    const { name, ignore_category_id } = req.body;
    const { community_id } = req.params;
    let whereConditions = { name, community_id };
    if (ignore_category_id) {
      whereConditions.id = { [Op.ne]: ignore_category_id };
    }
    const category = await Category.findOne({ where: whereConditions });
    if (category) {
      res.status(409).json({ message: "Category name already exists" });
    } else {
      res.json({ message: "Category name is available" });
    }
  } catch (error) {
    console.error("Error checking category name:", error);
    res.status(500).json({
      message: "Internal Server Error",
    });
  }
};

exports.createCategory = async (req, res) => {
  try {
    const { name, description } = req.body;
    const { community_id } = req.params;

    if (!community_id || !name || !description) {
      return res.status(400).json({
        message:
          "Parameters missing: name, description, or community_id not present",
      });
    }

    const existingCategory = await Category.findOne({
      where: {
        [Op.and]: [
          Sequelize.where(
            Sequelize.fn("LOWER", Sequelize.col("name")),
            Sequelize.fn("LOWER", name)
          ),
          { community_id },
        ],
      },
    });

    if (existingCategory) {
      return res.status(409).json({
        message: "A category with this name already exists in the community",
      });
    }

    const category = await Category.create({
      name: name,
      description: description,
      community_id,
    });

    res.json({
      message: "Category registered successfully",
      id: category.id,
    });
  } catch (error) {
    console.error("Error creating community category:", error);
    res.status(500).json({
      message: "Internal Server Error",
    });
  }
};

exports.editCategory = async (req, res) => {
  try {
    const { name, description } = req.body;
    const { category_id } = req.params;
    const category = await Category.findOne({ where: { id: category_id } });
    if (!category) {
      return res.status(404).send({ message: "Category not found" });
    }

    if (name) category.name = name;
    if (description) category.description = description;

    await category.save();

    res.status(200).send(category);
  } catch (error) {
    console.error("Error editing category:", error);
    res.status(500).send({ message: "Error editing category" });
  }
};

exports.deleteCategory = async (req, res) => {
  try {
    const { category_id } = req.params;
    const category = await Category.findOne({ where: { id: category_id } });
    if (!category) {
      return res.status(404).send({ message: "Category not found" });
    } else {
      await category.destroy();
      res.status(200).send({ message: "Category deleted successfully" });
    }
  } catch (error) {
    res.status(500).send({ message: "Error deleting category" });
  }
};

exports.migratePosts = async (req, res) => {
  const { from_category_id, to_category_id } = req.body;

  try {
    await Post.update(
      { category_id: to_category_id },
      { where: { category_id: from_category_id } }
    );

    res.status(200).json({ message: "Posts migrated successfully" });
  } catch (error) {
    console.error("Error migrating posts:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

exports.getPostContentById = async (req, res) => {
  const { post_id } = req.params;
  try {
    const post = await Post.findByPk(post_id, {
      attributes: ["content"],
    });

    if (!post) {
      return res.status(404).json({ message: "Post not found." });
    }

    res.status(200).json({ content: post.content });
  } catch (error) {
    console.error("Error fetching post content:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

exports.getPosts = async (req, res) => {
  const { category_id, limit = 5, page = 1 } = req.body;
  const { community_id } = req.params;

  try {
    let whereConditions = {};
    if (category_id) {
      whereConditions.category_id = category_id;
    } else if (community_id) {
      const categories = await Category.findAll({
        where: { community_id },
      });
      const categoryIds = categories.map((category) => category.id);
      whereConditions.category_id = categoryIds;
    }

    const offset = (page - 1) * limit;

    const { count, rows: posts } = await Post.findAndCountAll({
      where: whereConditions,
      limit,
      offset,
      attributes: ["id", "title", "category_id", "createdAt"],
      order: [["createdAt", "DESC"]],
      include: [
        {
          model: Category,
          as: "category",
          attributes: ["name"],
        },
        {
          model: User,
          as: "user",
          attributes: ["id", "username", "email", "picture"],
          include: [
            {
              model: UserCommunity,
              as: "userCommunities",
              attributes: ["role_id"],
              where: {
                community_id,
              },
              include: [
                {
                  model: Role,
                  as: "role",
                  attributes: ["name"],
                },
              ],
            },
          ],
        },
      ],
    });

    const totalPages = Math.ceil(count / limit);

    if (count === 0) {
      return res.status(404).json({ message: "No posts found." });
    }

    res.status(200).json({ posts, totalPages });
  } catch (error) {
    console.error("Error fetching posts:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

exports.getPost = async (req, res) => {
  try {
    const { community_id, post_id } = req.params;
    if (!post_id) {
      return res.status(400).json({
        message: "Parameters missing: post_id not present",
      });
    }
    const post = await Post.findByPk(post_id, {
      attributes: ["id", "title", "content", "category_id", "createdAt"],
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "username", "picture"],
          include: [
            {
              model: UserCommunity,
              as: "userCommunities",
              attributes: ["role_id"],
              where: {
                community_id,
              },
              include: [
                {
                  model: Role,
                  as: "role",
                  attributes: ["name"],
                },
              ],
            },
          ],
        },
        {
          model: PostReaction,
          as: "postReactions",
          attributes: ["user_id", "reaction_type"],
        },
      ],
    });

    if (!post) {
      return res.status(404).json({
        message: "Post not found",
      });
    }

    res.json(post);
  } catch (error) {
    console.error("Error fetching post:", error);
    res.status(500).json({
      message: "Internal Server Error",
    });
  }
};

exports.createPost = async (req, res) => {
  try {
    const { title, body } = req.body;
    const { category_id } = req.params;
    const user_id = req.user.id;
    if (!title || !body || !category_id) {
      return res.status(400).json({
        message: "Parameters missing: body, category_id or name not present",
      });
    }
    const post = await Post.create({
      title,
      content: body,
      user_id,
      category_id,
    });
    res.json({
      message: "Post registered successfully",
      id: post.id,
    });
  } catch (error) {
    console.error("Error creating community post:", error);
    res.status(500).json({
      message: "Internal Server Error",
    });
  }
};

exports.editPost = async (req, res) => {
  try {
    const { title, content, category_id } = req.body;
    const { post_id } = req.params;
    const post = await Post.findOne({ where: { id: post_id } });
    if (!post) {
      return res.status(404).send({ message: "Post not found" });
    }

    if (title) post.title = title;
    if (content) post.content = content;
    if (category_id) post.category_id = category_id;

    await post.save();

    res.status(200).send(post);
  } catch (error) {
    console.error("Error editing post:", error);
    res.status(500).send({ message: "Error editing post" });
  }
};

exports.deletePost = async (req, res) => {
  try {
    const { post_id } = req.params;
    const post = await Post.findOne({ where: { id: post_id } });
    if (!post) {
      return res.status(404).send({ message: "Post not found" });
    } else {
      await post.destroy();
      res.status(200).send({ message: "Post deleted successfully" });
    }
  } catch (error) {
    res.status(500).send({ message: "Error deleting post" });
  }
};

exports.createComment = async (req, res) => {
  try {
    const { content } = req.body;
    const { post_id } = req.params;
    const user_id = req.user.id;
    if (!content || !post_id) {
      return res.status(400).json({
        message: "Parameters missing: content or post_id not present",
      });
    }
    const comment = await Comment.create({
      content,
      post_id,
      user_id,
    });
    res.json({
      message: "Comment registered successfully",
      id: comment.id,
    });
  } catch (error) {
    console.error("Error creating community post:", error);
    res.status(500).json({
      message: "Internal Server Error",
    });
  }
};

exports.getComments = async (req, res) => {
  try {
    const { community_id, post_id } = req.params;
    if (!post_id) {
      return res.status(400).json({
        message: "Parameters missing: post_id not present",
      });
    }
    const comments = await Comment.findAndCountAll({
      where: { post_id: post_id },
      order: [["createdAt", "ASC"]],
      attributes: ["id", "content", "createdAt"],
      include: [
        {
          model: User,
          as: "user",
          attributes: ["username", "picture"],
          include: [
            {
              model: UserCommunity,
              as: "userCommunities",
              attributes: ["role_id"],
              where: {
                community_id,
              },
              include: [
                {
                  model: Role,
                  as: "role",
                  attributes: ["name"],
                },
              ],
            },
          ],
        },
        {
          model: CommentReaction,
          as: "commentReactions",
          attributes: ["user_id", "reaction_type"],
        },
      ],
    });
    res.json(comments);
  } catch (error) {
    console.error("Error fetching comments:", error);
    res.status(500).json({
      message: "Internal Server Error",
    });
  }
};

exports.reactComment = async (req, res) => {
  try {
    const { type } = req.body;
    const { comment_id } = req.params;
    const user_id = req.user.id;

    if (!type || !comment_id) {
      return res.status(400).json({
        message: "Parameters missing: type or comment_id not present",
      });
    }

    const existingReaction = await CommentReaction.findOne({
      where: { comment_id: comment_id, user_id: user_id },
    });

    if (existingReaction) {
      if (existingReaction.reaction_type === type) {
        await existingReaction.destroy();
        res.status(200).json({ message: "Reaction removed" });
      } else {
        await existingReaction.update({ reaction_type: type });
        res.status(200).json({ message: "Reaction updated" });
      }
    } else {
      await CommentReaction.create({
        comment_id: comment_id,
        user_id: user_id,
        reaction_type: type,
      });
      res.status(201).json({ message: "Reaction created" });
    }
  } catch (error) {
    console.error("Error reacting to comment:", error);
    res.status(500).json({
      message: "Internal Server Error",
    });
  }
};
exports.reactPost = async (req, res) => {
  try {
    const { type } = req.body;
    const { post_id } = req.params;
    const user_id = req.user.id;

    if (!type || !post_id) {
      return res.status(400).json({
        message: "Parameters missing: type or post_id not present",
      });
    }

    const existingReaction = await PostReaction.findOne({
      where: { post_id: post_id, user_id: user_id },
    });

    if (existingReaction) {
      if (existingReaction.reaction_type === type) {
        await existingReaction.destroy();
        res.status(200).json({ message: "Reaction removed" });
      } else {
        await existingReaction.update({ reaction_type: type });
        res.status(200).json({ message: "Reaction updated" });
      }
    } else {
      await PostReaction.create({
        post_id: post_id,
        user_id: user_id,
        reaction_type: type,
      });
      res.status(201).json({ message: "Reaction created" });
    }
  } catch (error) {
    console.error("Error reacting to post:", error);
    res.status(500).json({
      message: "Internal Server Error",
    });
  }
};

exports.deleteComment = async (req, res) => {
  try {
    const { comment_id } = req.params;
    const comment = await Comment.findOne({ where: { id: comment_id } });
    if (!comment) {
      return res.status(404).send({ message: "Comment not found" });
    } else {
      await comment.destroy();
      res.status(200).send({ message: "Comment deleted successfully" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Error deleting comment" });
  }
};

exports.deleteUserFromCommunity = async (req, res) => {
  try {
    const { community_id } = req.params;
    const user_id = req.body.user_id ? req.body.user_id : req.user.id;

    const user_community = await UserCommunity.findOne({
      where: { community_id, user_id },
    });
    if (!user_community) {
      return res.status(404).send({ message: "User not found in community" });
    } else {
      await user_community.destroy();
      res
        .status(200)
        .send({ message: "User deleted from community successfully" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Error deleting user from community" });
  }
};
