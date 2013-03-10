<?php
/**
 * Multiple attachment plugin files, contains hook callback and pretty much everything
 *
 * @package Wedgeward:MassAttach
 * @author Shitiz "Dragooon" Garg <Email mail@dragooon.net> <Url http://smf-media.com> (and Nao)
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
function massattach_post_form_pre()
{
	global $context, $board, $topic, $txt, $settings;

	if (!allowedTo('post_attachment'))
		return;

	loadLanguage('Errors');

	$current_attach_dir = get_attach_dir();

	$total_size = 0;
	if (!isset($_SESSION['temp_attachments']))
		$_SESSION['temp_attachments'] = array();
	foreach ($_SESSION['temp_attachments'] as $attach => $filename)
		$total_size += filesize($current_attach_dir . '/' . $attach);

	add_plugin_js_file('Wedgeward:MassAttach', 'attachui.js');
	add_js('
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
	};');
}

/**
 * Action handler for massattach, handles uploading of files via AJAX
 * A fair amount of this is borrowed from Post.php
 *
 * @return void
 */
function massattach()
{
	global $settings, $topic, $board, $options, $language, $board, $context;

	header('Content-type: text/plain; charset=utf-8');

	// No board?
	if (empty($board) && empty($context['allow_no_board']))
		massattach_error('no_board');

	// Not allowed to post attachments?
	if (!allowedTo('post_attachment'))
		massattach_error('permission_denied');

	$current_attach_dir = get_attach_dir();

	$stream = fopen('php://input', 'r');
	$filename = isset($_SERVER['HTTP_X_FILE_NAME']) ? $_SERVER['HTTP_X_FILE_NAME'] : '';

	if (empty($filename) || !is_writable($current_attach_dir))
		massattach_error('invalid_filename');

	// Check for extensions
	if (!empty($settings['attachmentCheckExtensions']))
		if (!in_array(strtolower(substr(strrchr($filename, '.'), 1)), explode(',', strtolower($settings['attachmentExtensions']))))
			massattach_error($txt['cant_upload_type'] . ' ' . $settings['attachmentExtensions']);

	if (!isset($_SESSION['temp_attachments']))
		$_SESSION['temp_attachments'] = array();
	$attachID = 'post_tmp_' . we::$id . '_' . (count($_SESSION['temp_attachments']) + 1);
	$dest = $current_attach_dir . '/' . $attachID;

	$target = fopen($dest, 'w');
	stream_copy_to_stream($stream, $target);
	fclose($target);

	// Make sure the size declared by the browser is same as the one we received.
	// This is mostly because on abort the request seems to be dumped into the
	// script, if there's a difference of filesize there's a good chance it was
	// an abort
	if (filesize($dest) < $_SERVER['CONTENT_LENGTH'])
	{
		@unlink($dest);
		exit;
	}

	// Do our basic attachment validation checks before counting this file in
	if (!empty($settings['attachmentSizeLimit']) &&	filesize($dest) > $settings['attachmentSizeLimit'] * 1024)
		massattach_error('file_too_big', $dest);
	if (!empty($settings['attachmentNumPerPostLimit']) && (count($_SESSION['temp_attachments']) + 1) > $settings['attachmentNumPerPostLimit'])
		massattach_error('attachments_limit_per_post', $dest);

	$total_size = 0;
	foreach ($_SESSION['temp_attachments'] as $attach => $dummy)
		$total_size += filesize($current_attach_dir . '/' . $attach);
	$total_size += filesize($dest);

	if (!empty($settings['attachmentPostLimit']) && $total_size > $settings['attachmentPostLimit'] * 1024)
		massattach_error('file_too_big', $dest);

	if (!empty($settings['attachmentDirSizeLimit']))
	{
		// Make sure the directory isn't full.
		$dirSize = 0;
		$dir = @scandir($current_attach_dir) or massattach_error('cant_access_upload_path', $dest);
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
			massattach_error('ran_out_of_space', $dest);
	}

	$_SESSION['temp_attachments'][$attachID] = $filename;

	@chmod($dest, 0644);

	echo json_encode(array('valid' => true, 'id' => $attachID, 'name' => $filename));
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
function massattach_error($error_code, $filepath = '')
{
	global $txt, $language;

	if (!empty($filepath))
		@unlink($filepath);

	loadLanguage(array('Errors', 'Post'), $language);
	echo json_encode(array('valid' => false, 'error' => isset($txt[$error_code]) ? $txt[$error_code] : $error_code));
	exit;
}
