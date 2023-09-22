const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Post = sequelize.define('Post', {
    title: {
      type: DataTypes.STRING,
      allowNull: false
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    date: {
      type: DataTypes.DATE,
      allowNull: false
    },
    user_id: {
      type: DataTypes.INTEGER,
      references: {
        model: 'Users', 
        key: 'id' 
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    },
    category_id: {
      type: DataTypes.INTEGER,
      references: {
        model: 'Categories', 
        key: 'id' 
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    }
  });

  Post.associate = (models) => {
    Post.belongsTo(models.Category, {
      foreignKey: 'category_id',
      as: 'category'
    });
    Post.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user'
    });
  };

  return Post;
};