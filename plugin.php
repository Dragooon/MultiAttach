<?php
/**
 * Multiple attachment plugin files, contains hook callback and pretty much everything
 *
 * @package Dragooon:MultiAttach
 * @author Shitiz "Dragooon" Garg <Email mail@dragooon.net> <Url http://smf-media.com>
 * @copyright 2012, Shitiz "Dragooon" Garg <mail@dragooon.net>
 * @license
 *		Licensed under "New BSD License (3-clause version)"
 *		http://www.opensource.org/licenses/BSD-3-Clause
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
	global $context, $board, $topic, $txt, $settings;
 	
 	if (!allowedTo('post_attachment'))
 		return;
 
	loadPluginLanguage('Dragooon:MultiAttach', 'plugin');
	loadLanguage('Errors');
 
	$current_attach_dir = get_attach_dir();

	$total_size = 0;
	foreach ($_SESSION['temp_attachments'] as $attach => $filename)
		$total_size += filesize($current_attach_dir . '/' . $attach);

 	add_plugin_js_file('Dragooon:MultiAttach', 'attachui.js');
 	add_js('
 	curr_board = ', $board, ';
 	curr_topic = ', $topic, ';
 	txt_drag_help = ', JavaScriptEscape($txt['multiattach_drag_help']), ';
 	txt_drag_help_subtext = ', JavaScriptEscape($txt['multiattach_drag_help_subtext']), ';
 	attachOpts = {
 		sizeLimit: ', $settings['attachmentSizeLimit'], ',
 		totalSizeLimit: ', $settings['attachmentPostLimit'], ',
 		maxNum: ', $settings['attachmentNumPerPostLimit'], ',
 		currentNum: ', count($_SESSION['temp_attachments']), ',
 		checkExtension: ', !empty($settings['attachmentCheckExtensions']) ? 'true' : 'false', ',
 		validExtensions: ', JavaScriptEscape($settings['attachmentExtensions']), '.split(","),
 		totalSize: ', round($total_size / 1024), ',
 		ext_error: ', JavaScriptEscape(str_replace('{attach_exts}', strtr($settings['attachmentExtensions'], array(',' => ', ')), $txt['cannot_attach_ext'])), ',
 		filesize_error: ', sprintf(JavaScriptEscape($txt['file_too_big']), $settings['attachmentSizeLimit']), ',
 		maxNum_error: ', sprintf(JavaScriptEscape($txt['attachments_limit_per_post']), $settings['attachmentNumPerPostLimit']), ',
 		totalFilesize_error: ', sprintf(JavaScriptEscape($txt['file_too_big']), $settings['attachmentPostLimit']), '
 	};
 ');
}

/**
 * Action handler for multiattach, handles uploading of files via AJAX
 * A fair amount of this is borrowed from Post.php
 *
 * @return void
 */
function multiattach()
{
	global $settings, $topic, $scripturl, $board, $options, $language, $user_info, $board, $context;

	header('Content-type: text/plain; charset=utf-8');

	// No board?
	if (empty($board) && empty($context['allow_no_board']))
		multiattach_error('no_board');

	// Not allowed to post attachments?
	if (!allowedTo('post_attachment'))
		multiattach_error('permission_denied');

	$current_attach_dir = get_attach_dir();

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
	foreach ($_SESSION['temp_attachments'] as $attach => $filename)
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
 * Returns the current attachment directory
 *
 * @return string
 */
 function get_attach_dir()
 {
 	global $settings;
 
 	if (!empty($settings['currentAttachmentUploadDir']))
	{
		if (!is_array($settings['attachmentUploadDir']))
			$settings['attachmentUploadDir'] = unserialize($settings['attachmentUploadDir']);

		// Just use the current path for temp files.
		$current_attach_dir = $settings['attachmentUploadDir'][$settings['currentAttachmentUploadDir']];
	}
	else
		$current_attach_dir = $settings['attachmentUploadDir'];
	
	return $current_attach_dir;
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