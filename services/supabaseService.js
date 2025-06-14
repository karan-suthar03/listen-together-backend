const { createClient } = require('@supabase/supabase-js');
const config = require('../config/config');
const fs = require('fs');
const path = require('path');

class SupabaseService {
  constructor() {
    if (!config.supabase.url) {
      throw new Error('Supabase URL is required in environment variables');
    }
    
    // Server-side operations REQUIRE service role key for full permissions
    if (!config.supabase.serviceRoleKey) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for server-side file operations');
    }
    
    console.log('🔑 Using service role key for Supabase operations (required for server-side storage)');
    
    this.supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);
    this.bucketName = config.supabase.bucket;
  }
  /**
   * Create the bucket if it doesn't exist
   */
  async initializeBucket() {
    try {
      // Check if bucket exists
      const { data: buckets, error: listError } = await this.supabase.storage.listBuckets();
      
      if (listError) {
        console.error('Error listing buckets:', listError);
        return false;
      }

      const bucketExists = buckets.some(bucket => bucket.name === this.bucketName);
      
      if (!bucketExists) {
        console.log(`Creating bucket: ${this.bucketName}`);
        const { data, error } = await this.supabase.storage.createBucket(this.bucketName, {
          public: true,
          allowedMimeTypes: ['audio/mpeg', 'audio/mp3'],
          fileSizeLimit: 100 * 1024 * 1024 // 100MB
        });

        if (error) {
          console.error('Error creating bucket:', error);
          console.log('💡 Tip: You may need to create the bucket manually in the Supabase dashboard');
          console.log('   Go to Storage → Create new bucket → Name: music-files → Public: Yes');
          return false;
        }
        
        console.log('Bucket created successfully:', data);
      } else {
        console.log(`Bucket ${this.bucketName} already exists`);
      }
      
      return true;
    } catch (error) {
      console.error('Error initializing bucket:', error);
      console.log('💡 Tip: You may need to create the bucket manually in the Supabase dashboard');
      console.log('   Go to Storage → Create new bucket → Name: music-files → Public: Yes');
      return false;
    }
  }

  /**
   * Upload a file to Supabase storage
   * @param {string} filePath - Local file path
   * @param {string} fileName - File name to use in storage
   * @param {Object} metadata - Optional metadata
   * @returns {Promise<Object>} Upload result with public URL
   */
  async uploadFile(filePath, fileName, metadata = {}) {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      // Read the file
      const fileBuffer = fs.readFileSync(filePath);
      
      // Upload to Supabase
      const { data, error } = await this.supabase.storage
        .from(this.bucketName)
        .upload(fileName, fileBuffer, {
          contentType: 'audio/mpeg',
          metadata: metadata,
          upsert: true // Replace if file already exists
        });

      if (error) {
        throw error;
      }

      // Get public URL
      const { data: { publicUrl } } = this.supabase.storage
        .from(this.bucketName)
        .getPublicUrl(fileName);

      console.log(`File uploaded successfully: ${fileName}`);
      console.log(`Public URL: ${publicUrl}`);

      return {
        success: true,
        data: data,
        publicUrl: publicUrl,
        fileName: fileName,
        path: data.path
      };
    } catch (error) {
      console.error('Error uploading file:', error);
      return {
        success: false,
        error: error.message,
        fileName: fileName
      };
    }
  }
  /**
   * Delete a file from Supabase storage
   * @param {string} fileName - File name to delete
   * @returns {Promise<Object>} Delete result
   */
  async deleteFile(fileName) {
    try {
      const { error } = await this.supabase.storage
        .from(this.bucketName)
        .remove([fileName]);

      if (error) {
        throw error;
      }

      console.log(`File deleted successfully: ${fileName}`);
      return { success: true };
    } catch (error) {
      console.error('Error deleting file:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Check if a file exists in Supabase storage
   * @param {string} fileName - File name to check
   * @returns {Promise<boolean>} File exists status
   */
  async fileExists(fileName) {
    try {
      const { data, error } = await this.supabase.storage
        .from(this.bucketName)
        .list('', {
          search: fileName
        });

      if (error) {
        throw error;
      }

      return data.some(file => file.name === fileName);
    } catch (error) {
      console.error('Error checking file existence:', error);
      return false;
    }
  }

  /**
   * Get public URL for a file
   * @param {string} fileName - File name
   * @returns {string} Public URL
   */
  getPublicUrl(fileName) {
    const { data: { publicUrl } } = this.supabase.storage
      .from(this.bucketName)
      .getPublicUrl(fileName);
    
    return publicUrl;
  }

  /**
   * List all files in the bucket
   * @returns {Promise<Array>} List of files
   */
  async listFiles() {
    try {
      const { data, error } = await this.supabase.storage
        .from(this.bucketName)
        .list();

      if (error) {
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Error listing files:', error);
      return [];
    }
  }

  /**
   * Clean up local file after successful upload
   * @param {string} filePath - Local file path to delete
   */
  async cleanupLocalFile(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`Local file cleaned up: ${filePath}`);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error cleaning up local file:', error);
      return false;
    }
  }
}

module.exports = new SupabaseService();
