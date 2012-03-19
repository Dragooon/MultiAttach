<?php
/**
 * Multiple attachment plugin files, contains hook callback and pretty much everything
 *
 * @package Dragooon:MultiAttach
 * @author Shitiz "Dragooon" Garg <Email mail@dragooon.net> <Url http://smf-media.com>
 * @copyright Shitiz "Dragooon" Garg <mail@dragooon.net>
 * @license
 *		Do whatever the hell you want, just give me some credit.
 *		Oh, and if this blows you or your forum to pieces, no blame on me. 'kay?
 *
 * @version 1.0
 */

/**
 * Callback for hook post_form_pre, loads the javascript for manipulating the upload via AJAX
 *
 * @return void
 */
function multiattach_post_form_pre()
{
	global $context;
 	
 	add_plugin_js_file('Dragooon:MultiAttach', 'attachui.js');
}

/**
 * Action handler for multiattach, handles uploading of files via AJAX
 * A fair amount of this is borrowed from Post.php
 *
 * @return void
 */
function multiattach()
{
	global $settings, $topic, $scripturl, $board, $options, $language, $user_info;

	header('Content-type: text/plain; charset=utf-8');

	// Not allowed to post attachments?
	if (!allowedTo('post_attachment'))
		multiattach_error('permission_denied');

	if (!empty($settings['currentAttachmentUploadDir']))
	{
		if (!is_array($settings['attachmentUploadDir']))
			$settings['attachmentUploadDir'] = unserialize($settings['attachmentUploadDir']);

		// Just use the current path for temp files.
		$current_attach_dir = $settings['attachmentUploadDir'][$settings['currentAttachmentUploadDir']];
	}
	else
		$current_attach_dir = $settings['attachmentUploadDir'];

	$stream = fopen('php://input', 'r');
	$filename = $_REQUEST['filename'];

	if (empty($filename) || !is_writable($current_attach_dir))
		multiattach_error('invalid_filename');

	// Check for extensions
	if (!empty($settings['attachmentCheckExtensions']))
		if (!in_array(strtolower(substr(strrchr($filename, '.'), 1)), explode(',', strtolower($settings['attachmentExtensions']))))
			multiattach_error('cant_upload_type');
	
	$attachID = 'post_tmp_' . $user_info['id'] . '_' . (count($_SESSION['temp_attachments']) + 1);
	$dest = $current_attach_dir . '/' . $attachID;

	$target = fopen($dest, 'w');
	stream_copy_to_stream($stream, $target);
	fclose($target);

	// Do our basic attachment validation checks before counting this file in
	if (!empty($settings['attachmentSizeLimit']) &&	filesize($dest) > $settings['attachmentSizeLimit'] * 1024)
		multiattach_error('file_too_big', $dest);
	if (!empty($settings['attachmentNumPerPostLimit']) && (count($_SESSION['temp_attachments']) + 1) > $settings['attachmentNumPerPostLimit'])
		multiattach_error('attachments_limit_per_post', $dest);
	
	$total_size = 0;
	foreach ($_SESSION['temp_attachments'] as $attach)
		$total_size += filesize($current_attach_dir . '/' . $attach);
	$totalsize += filesize($dest);

	if (!empty($settings['attachmentPostLimit']) && $total_size > $settings['attachmentPostLimit'] * 1024)
		multiattach_error('file_too_big', $dest);

	if (!empty($settings['attachmentDirSizeLimit']))
	{
		// Make sure the directory isn't full.
		$dirSize = 0;
		$dir = @scandir($current_attach_dir) or multiattach_error('cant_access_upload_path', $dest);
		foreach ($dir as $file)
		{
			if ($file == '.' || $file == '..')
				continue;

			if (preg_match('~^post_tmp_\d+_\d+$~', $file) != 0)
			{
				// Temp file is more than 5 hours old!
				if (filemtime($current_attach_dir . '/' . $file) < time() - 18000)
					@unlink($current_attach_dir . '/' . $file);
				continue;
			}

			$dirSize += filesize($current_attach_dir . '/' . $file);
		}

		// Too big! Maybe you could zip it or something...
		if (filesize($dest) + $dirSize > $settings['attachmentDirSizeLimit'] * 1024)
			multiattach_error('ran_out_of_space', $dest);
	}

	$_SESSION['temp_attachments'][$attachID] = $filename;

	@chmod($dest, 0644);

	echo json_encode(array('valid' => true));
	exit;
}

/**
 * Throws an error on our behalf
 *
 * @param string $error_code
 * @param string $filepath
 * @return void
 */
function multiattach_error($error_code, $filepath = '')
{
	global $txt, $language;

	if (!empty($filepath))
		@unlink($filepath);
	
	loadLanguage('Errors', $language);
	echo json_encode(array('valid' => false, 'error' => $txt[$error_code], 'code' => $error_code));
	exit;
}